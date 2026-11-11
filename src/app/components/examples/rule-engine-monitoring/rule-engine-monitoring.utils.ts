import {
  ApiSpanAttribute, ApiSpanTreeNode, ApiTraceSummary, ComparisonLabel, TraceDetail, TraceSpan, TraceStatus
} from './rule-engine-monitoring.models';

/** Reads a span attribute's string value (or stringified number) by key, or null when absent. */
function spanAttr(node: ApiSpanTreeNode, key: string): string | null {
  const a = (node.attributes ?? []).find(x => x.attributeKey === key);
  if (!a) { return null; }
  if (a.attributeValueString != null && a.attributeValueString !== '') { return a.attributeValueString; }
  if (a.attributeValueNumber != null) { return String(a.attributeValueNumber); }
  return null;
}

/** Maps an API span tree node to the view-model TraceSpan (start relative to the trace start `t0`). */
// Synthetic span the rule engine emits to mark a queue timeout; never shown as a node, only used to
// classify the branch it belongs to (and counted in the header).
const TIMEOUT_SPAN_NAME = 'Queue Message Processing Time Out';
const TRACE_MESSAGE_SNAPSHOT_SPAN_NAME = 'Trace Message Snapshot';
const INPUT_MESSAGE_DATA_ATTR = 'input.msg.data';
const INPUT_MESSAGE_METADATA_ATTR = 'input.msg.metadata';
const ROOT_MESSAGE_DATA_ATTR = 'root.message.data';
const ROOT_MESSAGE_METADATA_ATTR = 'root.message.metadata';

// Auxiliary spans that must never appear in the Rule Nodes tree / Timeline (not real rule-node executions).
const HIDDEN_SPAN_NAMES = new Set<string>([TIMEOUT_SPAN_NAME, TRACE_MESSAGE_SNAPSHOT_SPAN_NAME]);

interface TimeoutClassification {
  canceled: Set<string>;    // span ids in a timed-out-and-canceled branch
  continued: Set<string>;   // span ids in a timed-out-but-continued branch
  canceledCount: number;    // number of canceled timeout markers
  continuedCount: number;   // number of continued timeout markers
}

/** Ports the pure-JS timeout branch detection: a synthetic timeout span marks its sibling subtree
 *  (matched by message.id) as canceled or continued. */
function classifyTimeouts(roots: ApiSpanTreeNode[]): TimeoutClassification {
  const canceled = new Set<string>();
  const continued = new Set<string>();
  let canceledCount = 0;
  let continuedCount = 0;
  const markSubtree = (n: ApiSpanTreeNode, set: Set<string>): void => {
    set.add(String(n.spanId));
    (n.children ?? []).forEach(c => markSubtree(c, set));
  };
  const recurse = (spans: ApiSpanTreeNode[], parent: ApiSpanTreeNode | null): void => {
    for (let i = 0; i < spans.length; i++) {
      const span = spans[i];
      if (span.name === TIMEOUT_SPAN_NAME) {
        const isCanceled = spanAttr(span, 'queue.cancel.time.out.messages') === 'true';
        if (isCanceled) { canceledCount++; } else { continuedCount++; }
        const set = isCanceled ? canceled : continued;
        const timeoutMsgId = spanAttr(span, 'message.id');
        if (parent) {
          let marked = false;
          if (timeoutMsgId) {
            for (let j = 0; j < spans.length; j++) {
              if (j === i) { continue; }
              const sib = spans[j];
              if (sib.name !== TIMEOUT_SPAN_NAME && spanAttr(sib, 'message.id') === timeoutMsgId) {
                markSubtree(sib, set);
                marked = true;
              }
            }
          }
          if (!marked) { set.add(String(parent.spanId)); }
        } else if (i > 0) {
          const prev = spans[i - 1];
          const prevMsgId = spanAttr(prev, 'message.id');
          if (!timeoutMsgId || !prevMsgId || prevMsgId === timeoutMsgId) { markSubtree(prev, set); }
        }
      } else if (span.children?.length) {
        recurse(span.children, span);
      }
    }
  };
  recurse(roots, null);
  return { canceled, continued, canceledCount, continuedCount };
}

interface SpanBuildCtx {
  timeouts: TimeoutClassification;
  retries: number;   // accumulated count of retry spans
}

/** Maps a sibling group (excluding synthetic timeout spans) to TraceSpans, detecting retries within the
 *  group (duplicate message.id) and classifying each span's status. */
function mapSpans(nodes: ApiSpanTreeNode[], t0: number, ctx: SpanBuildCtx): TraceSpan[] {
  const visible = (nodes ?? []).filter(n => !HIDDEN_SPAN_NAMES.has(n.name));
  const seenMsgIds = new Set<string>();
  return visible.map(node => {
    const end = node.endTime ?? node.startTime;
    const durationMs = node.duration ?? Math.max(0, end - node.startTime);
    const spanId = String(node.spanId);
    const messageId = spanAttr(node, 'message.id');
    const hasError = !!node.statusCode && node.statusCode !== 'OK' && node.statusCode !== 'UNSET';

    let retry = false;
    if (messageId) {
      if (seenMsgIds.has(messageId)) { retry = true; ctx.retries++; } else { seenMsgIds.add(messageId); }
    }

    let status: TraceSpan['status'] = 'success';
    if (hasError) { status = 'error'; }
    else if (ctx.timeouts.canceled.has(spanId)) { status = 'timeoutCanceled'; }
    else if (ctx.timeouts.continued.has(spanId)) { status = 'timeoutContinued'; }

    return {
      spanId: node.spanId,
      name: spanAttr(node, 'rule.node.name') ?? node.name,
      type: spanAttr(node, 'rule.node.type') ?? '',
      ruleChain: spanAttr(node, 'rule.chain.name') ?? '',
      queueName: spanAttr(node, 'queue.name'),
      serviceId: node.serviceName ?? '',
      relation: null,   // edge relation label is not captured on spans today
      startMs: Math.max(0, node.startTime - t0),
      durationMs,
      startTs: node.startTime,
      endTs: end,
      error: hasError,
      status,
      retry,
      messageId,
      statusCode: node.statusCode ?? null,
      statusMessage: node.statusMessage ?? null,
      attributes: node.attributes ?? [],
      children: mapSpans(node.children ?? [], t0, ctx),
    };
  });
}

function findTraceMessageSnapshot(nodes: ApiSpanTreeNode[]): ApiSpanTreeNode | null {
  for (const node of nodes ?? []) {
    if (node.name === TRACE_MESSAGE_SNAPSHOT_SPAN_NAME) {
      return node;
    }
    const childSnapshot = findTraceMessageSnapshot(node.children ?? []);
    if (childSnapshot) {
      return childSnapshot;
    }
  }
  return null;
}

function appendRootMessageAttributes(spans: TraceSpan[], tree: ApiSpanTreeNode[]): void {
  const firstSpan = firstVisibleSpan(spans);
  if (!firstSpan) {
    return;
  }
  const snapshot = findTraceMessageSnapshot(tree);
  if (!snapshot) {
    return;
  }
  const rootMessageAttributes = [
    rootMessageAttribute(snapshot, INPUT_MESSAGE_DATA_ATTR, ROOT_MESSAGE_DATA_ATTR),
    rootMessageAttribute(snapshot, INPUT_MESSAGE_METADATA_ATTR, ROOT_MESSAGE_METADATA_ATTR),
  ].filter((attribute): attribute is ApiSpanAttribute => attribute !== null);
  if (rootMessageAttributes.length) {
    firstSpan.attributes = [...(firstSpan.attributes ?? []), ...rootMessageAttributes];
  }
}

function firstVisibleSpan(spans: TraceSpan[]): TraceSpan | null {
  for (const span of spans ?? []) {
    return span;
  }
  return null;
}

function rootMessageAttribute(snapshot: ApiSpanTreeNode, sourceKey: string, targetKey: string): ApiSpanAttribute | null {
  const source = (snapshot.attributes ?? []).find(attribute => attribute.attributeKey === sourceKey);
  if (!source) {
    return null;
  }
  return {
    attributeKey: targetKey,
    attributeValueString: source.attributeValueString,
    attributeValueNumber: source.attributeValueNumber,
    attributeValueBoolean: source.attributeValueBoolean,
  };
}

/** Builds a TraceDetail from the trace summary + span tree returned by the API. */
export function buildTraceDetailFromApi(traceId: string, summary: ApiTraceSummary, tree: ApiSpanTreeNode[]): TraceDetail {
  const t0 = summary?.startTime ?? (tree.length ? Math.min(...tree.map(n => n.startTime)) : 0);
  const timeouts = classifyTimeouts(tree ?? []);
  const ctx: SpanBuildCtx = { timeouts, retries: 0 };
  const spans = mapSpans(tree ?? [], t0, ctx);
  appendRootMessageAttributes(spans, tree ?? []);
  const root = tree[0];

  // distinct entities across the whole tree (for the filters and rule-node counter)
  const services = new Set<string>();
  const queues = new Set<string>();
  const ruleChains = new Set<string>();
  const ruleNodes = new Set<string>();
  const walk = (n: ApiSpanTreeNode): void => {
    if (n.serviceName) { services.add(n.serviceName); }
    const q = spanAttr(n, 'queue.name'); if (q) { queues.add(q); }
    const rc = spanAttr(n, 'rule.chain.name'); if (rc) { ruleChains.add(rc); }
    const rn = spanAttr(n, 'rule.node.name'); if (rn) { ruleNodes.add(rn); }
    (n.children ?? []).forEach(walk);
  };
  (tree ?? []).forEach(walk);

  const errorCount = summary?.errorCount ?? 0;
  const status: TraceStatus = errorCount > 0 ? 'failed' : 'success';
  const countVisible = (list: TraceSpan[]): number => list.reduce((n, s) => n + 1 + countVisible(s.children), 0);
  const spanCount = summary?.spanCount ?? countVisible(spans);
  const timedOut = timeouts.canceledCount > 0 || timeouts.continuedCount > 0;

  return {
    traceId,
    startTs: summary?.startTime ?? t0,
    endTs: summary?.endTime ?? t0,
    durationMs: summary?.duration ?? 0,
    inQueueTimeMs: summary?.inQueueTime ?? 0,
    totalSpanTimeMs: summary?.totalSpanTime ?? 0,
    status,
    withTimeout: timedOut,
    withErrors: errorCount > 0,
    queueId: '',
    queueName: (root ? spanAttr(root, 'queue.name') : null) ?? '—',
    messageType: (root ? spanAttr(root, 'message.type') : null) ?? '—',
    ruleChainId: '',
    ruleChainName: (root ? spanAttr(root, 'rule.chain.name') : null) ?? '—',
    ruleNodeCount: ruleNodes.size,
    services: [...services],
    queues: [...queues],
    ruleChains: [...ruleChains],
    ruleNodes: [...ruleNodes],
    pathId: '',
    pathName: '',
    spans,
    spanCount,
    errorCount,
    retriesCount: ctx.retries,
    timedOutCanceledCount: timeouts.canceledCount,
    timedOutContinuedCount: timeouts.continuedCount,
  };
}

export function formatAvgDuration(ms: number | null): string {
  if (ms === null || ms === undefined) { return '—'; }
  if (ms === 0) { return '0 ms'; }
  if (ms < 1000) { return `${Math.round(ms)} ms`; }
  return formatDuration(ms);
}

export function formatDuration(ms: number): string {
  if (ms === null || ms === undefined) {
    return '0 ms';
  }
  if (ms < 1000) {
    return `${ms} ms`;
  }
  if (ms < 60_000) {
    return `${(ms / 1000).toFixed(1)} s`;
  }
  if (ms < 3_600_000) {
    return `${(ms / 60_000).toFixed(1)} min`;
  }
  return `${(ms / 3_600_000).toFixed(1)} h`;
}

/** Human-friendly "time ago" relative to a reference instant (`now`), e.g. "2 min ago", "1 hour ago",
 *  "Yesterday". Returns "—" when the timestamp is missing/zero. Used for the Last Observed column,
 *  where `now` is the end of the selected dashboard time range. */
export function formatRelativeTime(ts: number | null | undefined, now: number): string {
  if (!ts) { return '—'; }
  const diffMs = now - ts;
  if (diffMs < 45_000) { return 'just now'; }
  const min = Math.floor(diffMs / 60_000);
  if (min < 60) { return `${min} min ago`; }
  const hr = Math.floor(min / 60);
  if (hr < 24) { return `${hr} hour${hr === 1 ? '' : 's'} ago`; }
  const day = Math.floor(hr / 24);
  if (day === 1) { return 'Yesterday'; }
  if (day < 7) { return `${day} days ago`; }
  const wk = Math.floor(day / 7);
  if (wk < 5) { return `${wk} week${wk === 1 ? '' : 's'} ago`; }
  const mo = Math.floor(day / 30);
  if (mo < 12) { return `${mo} month${mo === 1 ? '' : 's'} ago`; }
  const yr = Math.floor(day / 365);
  return `${yr} year${yr === 1 ? '' : 's'} ago`;
}

/** Formats a 0..1 ratio as a percentage, e.g. 0.9695 → "97.0%". */
export function formatPercent(rate: number | null): string {
  if (rate === null || rate === undefined) { return '—'; }
  return `${(rate * 100).toFixed(1)}%`;
}

/** Strips the package prefix from a fully-qualified rule node type:
 *  "org.thingsboard.rule.engine.filter.TbJsFilterNode" → "TbJsFilterNode".
 *  Leaves already-short types untouched. */
export function shortNodeType(type: string | null): string {
  if (!type) { return '—'; }
  const idx = type.lastIndexOf('.');
  return idx >= 0 ? type.substring(idx + 1) : type;
}

/** Compact number formatting for the inspector: 1,200,000 → "1.2M", 18,900 → "18.9K", 134,000 → "134K". */
export function formatCompact(n: number): string {
  const abs = Math.abs(n);
  const strip = (x: number) => x.toFixed(1).replace(/\.0$/, '');
  if (abs >= 1e9) return `${strip(n / 1e9)}B`;
  if (abs >= 1e6) return `${strip(n / 1e6)}M`;
  if (abs >= 1e3) return `${strip(n / 1e3)}K`;
  return Math.round(n).toLocaleString('en-US');
}

export function computeDelta(current: number, comparison: number): number | null {
  if (!comparison) {
    return null;
  }
  const delta = (current - comparison) / comparison * 100;
  return Math.abs(delta) < 1 ? null : delta;
}

export function comparisonLabel(delta: number | null, lowerIsBetter: boolean): ComparisonLabel {
  if (delta === null) {
    return { delta: null, colour: 'neutral' };
  }
  const positive = delta > 0;
  const improved = lowerIsBetter ? !positive : positive;
  return { delta, colour: improved ? 'green' : 'red' };
}

export function buildGroupByParam(dims: string[]): string {
  return dims.join(',');
}

export interface SparsePoint {
  bucketTime: number;
  value: number;
}

export type FillMode = 'zero' | 'null';

/**
 * Converts a sparse time-series (only buckets where something happened) into a dense
 * series covering every expected bucket in [startTs, endTs). Missing buckets are filled
 * with 0 ('zero' mode — count/sum/gauge metrics) or null ('null' mode — duration metrics
 * that have no meaning when no executions happened).
 *
 * The grid is aligned to multiples of intervalMs to match the backend bucket boundaries
 * computed as (bucket_time / intervalMs) * intervalMs.
 */
export function densifyTimeSeries(
  points: SparsePoint[],
  startTs: number,
  endTs: number,
  intervalMs: number,
  fillMode: FillMode
): [number, number | null][] {
  const valuesByBucket = new Map<number, number>();
  for (const point of points) {
    valuesByBucket.set(point.bucketTime, point.value);
  }

  const fill = fillMode === 'zero' ? 0 : null;
  const alignedStart = Math.floor(startTs / intervalMs) * intervalMs;

  const result: [number, number | null][] = [];
  for (let bucket = alignedStart; bucket < endTs; bucket += intervalMs) {
    result.push([bucket, valuesByBucket.get(bucket) ?? fill]);
  }
  return result;
}

// true = lower is better, false = higher is better
export const METRIC_POLARITY: Record<string, boolean> = {
  totalFailedExecs: true,
  avgDuration: true,
  totalProcessingTime: true,
  queueTimeoutCount: true,
  successRate: false,
  totalExecs: false,
  execCount: false,
};

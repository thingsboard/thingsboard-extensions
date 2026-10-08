export interface QueueOption {
  id: string;
  name: string;
  tenantId: string | null;
}

export interface RuleChainOption {
  id: string;
  name: string;
}

export interface RuleNodeOption {
  id: string;
  name: string;
  ruleChainId: string;
  ruleChainName: string;
}

export interface FilterOptions {
  queues: QueueOption[];
  ruleChains: RuleChainOption[];
  ruleNodes: RuleNodeOption[];
  serviceIds: string[];
}

export interface FilterState {
  startTs: number;
  endTs: number;
  queueIds: string[];
  ruleChainIds: string[];
  ruleNodeIds: string[];
  serviceIds: string[];
}

export interface TimeRange {
  startTs: number;
  endTs: number;
}

export interface CompareState {
  baseRange: TimeRange | null;  // null = compare mode on but no range selected yet
  compareRange: TimeRange | null;
}

// Matches backend RuleNodeTableRow JSON fields
export interface NodeStatsRow {
  execCount: number | null;
  errorCount: number | null;
  totalDurationMs: number | null;
  avgDurationMs: number | null;
  maxDurationMs: number | null;
  p95DurationMs: number | null;
  tenantId: string | null;
  serviceId: string | null;
  queueId: string | null;
  ruleChainId: string | null;
  ruleNodeId: string | null;
}

// Matches backend QueueTableEntry JSON fields
export interface QueueStatsRow {
  timeoutCount: number | null;
  failureCount: number | null;
  successCount: number | null;
  tenantId: string | null;
  serviceId: string | null;
  queueId: string | null;
  ruleChainId: string | null;
  ruleNodeId: string | null;
  queueTenantId: string | null;
}

// Matches backend RuleNodeTsKvEntry JSON fields; bucketTime is the interval start timestamp
export interface NodeTsEntry {
  bucketTime: number;
  execCount: number | null;
  errorCount: number | null;
  totalDurationMs: number | null;
  avgDurationMs: number | null;
  maxDurationMs: number | null;
  p95DurationMs: number | null;
}

// Matches backend QueueTimeseriesEntry JSON fields
export interface QueueTsEntry {
  bucketTime: number;
  timeoutCount: number | null;
}

// Matches backend QueueLagTimeseriesEntry JSON fields (queueTenantId/queueId are null when not grouped)
export interface QueueLagTsEntry {
  bucketTime: number;
  lag: number | null;
}

// Matches backend MergedStatsTableRow JSON
export interface MergedStatsTableRow {
  queueId:         string | null;
  ruleChainId:     string | null;
  ruleNodeId:      string | null;
  serviceId:       string | null;
  execCount:       number | null;
  errorCount:      number | null;
  totalDurationMs: number | null;
  avgDurationMs:   number | null;
  maxDurationMs:   number | null;
  p95DurationMs:   number | null;
  timeoutCount:    number | null;
}

// Matches backend MetricDelta JSON.
// deltaPercent=null is ambiguous — the frontend must inspect baseValue/compareValue first:
//   baseValue=null             → "New"     (entity absent from base window)
//   compareValue=null          → "Missing" (entity absent from compare window)
//   both null                  → "N/A"     (metric absent in both windows)
//   baseValue=0, compareValue=0→ "0%"      (both zero, neutral)
//   baseValue=0                → "New"     (can't divide by zero)
//   deltaPercent=null (else)   → "~"       (change < 1%, negligible)
export interface MetricDelta {
  baseValue:    number | null;
  compareValue: number | null;
  deltaValue:   number | null;
  deltaPercent: number | null;
}

// Matches backend MergedStatsDelta JSON
export interface MergedStatsDelta {
  queueId:         string | null;
  ruleChainId:     string | null;
  ruleNodeId:      string | null;
  serviceId:       string | null;
  execCount:       MetricDelta;
  errorCount:      MetricDelta;
  totalDurationMs: MetricDelta;
  avgDurationMs:   MetricDelta;
  maxDurationMs:   MetricDelta;
  p95DurationMs:   MetricDelta;
  timeoutCount:    MetricDelta;
}

// Merged view row: dimension names resolved from FilterOptions client-side
export interface MergedTableRow {
  queueId: string | null;
  queueName: string | null;
  ruleChainId: string | null;
  ruleChainName: string | null;
  ruleNodeId: string | null;
  ruleNodeName: string | null;
  serviceId: string | null;
  execCount: number | null;
  errorCount: number | null;
  avgDurationMs: number | null;
  totalDurationMs: number | null;
  maxDurationMs: number | null;
  p95DurationMs: number | null;
  timeoutCount: number | null;
}

export type ComparisonColour = 'green' | 'red' | 'neutral';

export interface ComparisonLabel {
  delta: number | null;
  colour: ComparisonColour;
}

// ── Trace path statistics (execution paths) ─────────────────────────────────────
// Matches the trace stats API response (see openspec/api.json).

export interface TracePathRef {
  id: string;
  name: string;
}

// Path-level aggregated trace metrics
export interface TracePathMetrics {
  traceCount: number;
  successTraceCount: number;
  failedTraceCount: number;
  timeoutTraceCount: number;
  successRate: number;            // 0..1
  avgTraceDurationMs: number;
  maxTraceDurationMs: number;
  p95TraceDurationMs: number;
  totalTraceDurationMs: number;
}

export interface TracePathGraphNode {
  id: string;
  name: string;
  type: string;
  ruleChainId?: string;
  ruleChainName?: string;
  queueId?: string;
  queueName?: string;
}

export interface TracePathGraphEdge {
  from: string;
  to: string;
  relation: string;
}

export interface TracePathGraph {
  rootNodeId: string;
  nodes: TracePathGraphNode[];
  edges: TracePathGraphEdge[];
}

// Per-rule-node metrics within a single path
export interface TraceRuleNodeMetric {
  ruleNodeId: string;
  ruleNodeName: string;
  ruleNodeType: string;
  ruleChainId?: string;
  ruleChainName?: string;
  executionCount: number;
  failedExecutionCount: number;
  timeoutCount: number;
  avgDurationMs: number;
  maxDurationMs: number;
  p95DurationMs: number;
  totalDurationMs: number;
}

export interface TracePath {
  pathId: string;
  pathHash: string;
  name: string;
  messageType: string;
  queue: TracePathRef;
  ruleChain: TracePathRef;
  metrics: TracePathMetrics;
  pathGraph: TracePathGraph;
  ruleNodeMetrics: TraceRuleNodeMetric[];
}

export interface TraceStatsSummary {
  totalTraceCount: number;
  totalExecutionCount: number;
  avgTraceDurationMs: number;
  maxTraceDurationMs: number;
  successRate: number;
  errorTraceCount: number;
  timeoutTraceCount: number;
}

export interface TracePageInfo {
  page: number;
  pageSize: number;
  totalElements: number;
}

export interface TraceStatsResponse {
  fromTs: number;
  toTs: number;
  interval: string;
  page: TracePageInfo;
  summary: TraceStatsSummary;
  paths: TracePath[];
}

// Tracing configuration shown/edited in the Trace Settings drawer
export type MessagePayloadRecording = 'NONE' | 'FIRST_SPAN' | 'ALL_SPANS';
export type ApiMessagePayloadRecording = MessagePayloadRecording;

export interface TraceSettings {
  enabled: boolean;
  tracesPerInterval: number;        // max traces collected per interval
  tracesPerPack: number;            // max traced messages per pack per tenant; 0 = unlimited
  interval: number;                 // collection interval, seconds
  ruleEngineRotation: boolean;      // whether tracing rotates across rule engine instances
  ruleEngineSwitchInterval: number; // how often tracing rotates to another rule engine, seconds (when rotation is on)
  relatedTraceSampleInterval: number; // min spacing between drill-down traces persisted per path, seconds
  messagePayloadRecording: MessagePayloadRecording; // controls message data/metadata capture
  maxTraceGroupsPerDay: number;     // max trace groups (paths) tracked per tenant per day; 0 = unlimited
}

// Backend trace coverage setting payload (GET/POST /api/traces/coverage). Maps 1:1 to TraceSettings.
export interface ApiTraceCoverageSetting {
  enabled: boolean;
  tracesPerInterval: number;
  tracesPerPack: number;
  intervalSeconds: number;
  ruleEngineRotation: boolean;
  switchPeriodSeconds: number;
  relatedTraceSampleIntervalSeconds: number;
  messagePayloadRecording?: ApiMessagePayloadRecording;
  maxTraceGroupsPerDay: number;
}

// ── Individual traces (global Traces view + shared Trace Details) ───────────────

export type TraceStatus = 'success' | 'failed' | 'timeout';

// A single trace as shown in the global Traces list.
export interface TraceListItem {
  traceId: string;
  startTs: number;          // trace start time (epoch ms)
  endTs: number;            // trace end time (epoch ms)
  durationMs: number;       // total (wall-clock) trace duration
  inQueueTimeMs: number;    // time spent waiting in queue(s)
  totalSpanTimeMs: number;  // cumulative active span (processing) time
  status: TraceStatus;
  withTimeout: boolean;
  withErrors: boolean;
  queueId: string;
  queueName: string;        // root queue
  messageType: string;      // root message type
  ruleChainId: string;
  ruleChainName: string;    // root rule chain
  ruleNodeCount: number;    // distinct rule nodes touched
  // distinct entities the trace touches (for the Traces filters; "contains at least one such span")
  services: string[];
  queues: string[];
  ruleChains: string[];
  ruleNodes: string[];
  pathId: string;           // execution path this trace belongs to
  pathName: string;
}

// A span (rule-node hop) in a trace's waterfall. Structurally matches the graph node used by the
// execution-paths timeline.
// Per-span status used for tree highlighting + timeline bar colour (matches the pure-JS widget).
export type SpanStatus = 'success' | 'error' | 'timeoutCanceled' | 'timeoutContinued';

export interface TraceSpan {
  spanId: string;
  name: string;
  type: string;             // short rule-node type
  ruleChain: string;
  queueName?: string | null;
  serviceId: string;        // rule engine instance, e.g. "rule-engine-0"
  relation: string | null;  // label on the edge into this span (null at root)
  startMs: number;          // relative to trace start
  durationMs: number;
  error: boolean;
  // Trace-detail-only enrichment (set by buildTraceDetailFromApi; optional for the path-graph builders)
  startTs?: number;         // absolute span start (epoch ms)
  endTs?: number;           // absolute span end (epoch ms)
  status?: SpanStatus;      // success | error | timeoutCanceled | timeoutContinued
  retry?: boolean;          // message reprocessed (same message.id seen among siblings)
  messageId?: string | null;
  statusCode?: string | null;
  statusMessage?: string | null;     // error/status message shown as the exception for error spans
  attributes?: ApiSpanAttribute[];   // raw attributes for the span-detail panel
  children: TraceSpan[];
}

// Full trace detail: the list item plus the resolved span tree.
export interface TraceDetail extends TraceListItem {
  spans: TraceSpan[];       // root spans (tree)
  // Header counters (set by buildTraceDetailFromApi; optional for path-graph builders)
  spanCount?: number;        // total rule nodes (spans)
  errorCount?: number;       // spans with an error status
  retriesCount?: number;     // spans flagged as retries
  timedOutCanceledCount?: number;    // timed-out branches where the message was canceled
  timedOutContinuedCount?: number;   // timed-out branches where processing continued
}

// ── Execution path API (trace_group-backed; see openspec/Architecture/path-api.md) ──────────────

// Generic paginated envelope returned by the backend (matches PageData<>).
export interface PageData<T> {
  data: T[];
  totalPages: number;
  totalElements: number;
  hasNext: boolean;
}

// Id+name option used by the path filter dropdowns.
export interface PathOptionRef {
  id: string;
  name: string;
}

export interface PathRuleNodeOptionRef extends PathOptionRef {
  ruleChainId: string;
}

// GET /api/traces/paths/filters → consolidated filter options (mirrors RuleEngineMonitoringFilters).
export interface TracePathFilters {
  queues: PathOptionRef[];
  ruleChains: PathOptionRef[];
  ruleNodes: PathRuleNodeOptionRef[];
  messageTypes: string[];
}

// GET /api/traces/paths → one row per aggregated execution path (TracePathDTO).
export interface PathListItem {
  pathId: string;
  rootQueueId: string | null;
  rootQueueName: string | null;
  rootMessageType: string | null;
  rootRuleChainId: string | null;
  rootRuleChainName: string | null;
  processedTraces: number;
  processedTracesWithTimeout: number;
  processedTracesWithError: number;
  storedTraces: number;
  totalTime: number;
  maxTime: number;
  totalInQueueTime: number;
  totalRuleNodeProcessingTime: number;
  errorCount: number;
  lastObserved: number;
}

// A node of the rule node tree returned by the path details endpoint, carrying its aggregated metrics.
export interface RuleNodeTreeNode {
  ruleNodeId: string;
  ruleNodeName: string;
  ruleNodeType: string;
  ruleChainId: string | null;
  ruleChainName: string | null;
  queueId: string | null;
  queueName: string | null;
  relation: string | null;          // label on the edge into this node (null at root)
  totalTime: number;
  totalCount: number;
  errors: number;
  children: RuleNodeTreeNode[];
}

// GET /api/traces/paths/{pathId} → path summary + logical rule node tree (TracePathDetailsDTO).
export interface TracePathDetails extends PathListItem {
  ruleNodeTree: RuleNodeTreeNode[];
}

// Sort fields accepted by GET /api/traces/paths.
export type PathSortField =
  'ROOT_QUEUE' | 'ROOT_MESSAGE_TYPE' | 'ROOT_RULE_CHAIN' | 'LAST_OBSERVED' |
  'TRACES_COUNT' | 'STORED_TRACES' | 'TIMEOUT_TRACES' | 'ERROR_TRACES' |
  'AVG_TIME' | 'AVG_IN_QUEUE_TIME' | 'AVG_RULE_NODE_PROCESSING_TIME' | 'MAX_TIME' | 'ERROR_COUNT';

export type PathSortOrder = 'ASC' | 'DESC';

export type TraceSortField = 'START_TIME' | 'RULE_NODE_COUNT' | 'DURATION' | 'IN_QUEUE_TIME' | 'TOTAL_SPAN_TIME';

export type TraceSortOrder = 'ASC' | 'DESC';

// Query parameters for the paginated paths list (entry-point filters + paging + sort).
export interface PathListQuery {
  page: number;
  pageSize: number;
  sortBy: PathSortField;
  sortOrder: PathSortOrder;
  rootQueueId?: string | null;
  rootMessageType?: string | null;
  rootRuleChainId?: string | null;
}

// Reference to an execution path used as a Traces-view filter (set from Path Details "View traces").
export interface ExecutionPathRef {
  pathId: string;
  label: string;            // e.g. "HighPriority / ALARM / Root Rule Chain"
}

// GET /api/traces/filters → consolidated filter options for the Traces list (separate from TracePathFilters).
export interface TraceListFilters {
  ruleEngines: string[];
  queues: PathOptionRef[];
  ruleChains: PathOptionRef[];
  ruleNodes: PathRuleNodeOptionRef[];
  messageTypes: string[];
}

// GET /api/traces (searchTraces) row — the enriched trace summary (counts, not name arrays).
export interface ApiTraceDTO {
  traceId: string;
  startTime: number;
  endTime?: number | null;
  duration?: number | null;
  spanCount?: number | null;
  errorCount?: number | null;
  inQueueTime?: number | null;
  totalSpanTime?: number | null;
  rootQueueId?: string | null;
  queueName?: string | null;
  messageType?: string | null;
  rootRuleChainId?: string | null;
  ruleNodeCount?: number | null;
  hasErrors?: boolean | null;
  hasQueueTimeouts?: boolean | null;
}

// ── Trace details API responses (GET /api/traces/{id} and /spans/tree) ──────────────

export interface ApiTraceSummary {
  traceId: string;
  serviceName?: string | null;
  startTime: number;
  endTime?: number | null;
  duration?: number | null;
  spanCount?: number | null;
  errorCount?: number | null;
  inQueueTime?: number | null;
  totalSpanTime?: number | null;
}

export interface ApiSpanAttribute {
  attributeKey: string;
  attributeValueString?: string | null;
  attributeValueNumber?: number | null;
  attributeValueBoolean?: boolean | null;
}


export interface ApiSpanTreeNode {
  spanId: string;
  parentSpanId?: string | null;
  name: string;
  serviceName?: string | null;
  startTime: number;
  endTime?: number | null;
  duration?: number | null;
  statusCode?: string | null;
  statusMessage?: string | null;
  children: ApiSpanTreeNode[];
  attributes: ApiSpanAttribute[];
}

// Filter model for the global Traces list. null/false = unset. Combined with AND.
export interface TraceFilters {
  traceId: string | null;      // exact trace id (when set, other filters are ignored)
  ruleEngine: string | null;   // trace touches this rule-engine service
  queue: string | null;        // trace touches this queue
  ruleChain: string | null;    // trace has at least one span in this rule chain
  ruleNode: string | null;     // trace has at least one span in this rule node
  messageType: string | null;  // root message type (dropdown)
  messageId: string | null;    // exact message id (custom entered)
  originator: string | null;   // exact originator id (custom entered)
  messageData: string | null;  // substring match on input.msg.data (custom entered)
  messageMetadata: string | null; // substring match on input.msg.metadata (custom entered)
  withTimeout: boolean;        // trace has at least one timed-out span
  withError: boolean;          // trace has at least one failed span
  pathId: string | null;       // group id, set from Trace Groups "View traces" or the Saved Traces filter
}

export function emptyTraceFilters(): TraceFilters {
  return {
    traceId: null,
    ruleEngine: null, queue: null, ruleChain: null, ruleNode: null,
    messageType: null, messageId: null, originator: null, messageData: null, messageMetadata: null,
    withTimeout: false, withError: false, pathId: null,
  };
}

# RMX Truck Timeseries Export

## Overview

ThingsBoard has no single "export all telemetry for a device type" endpoint, so the script does it in three moves:

1. **Authenticate** against `/api/auth/login` and hold the JWT (with silent refresh on expiry).
2. **List devices** of type `RMX Truck` via the paginated tenant device endpoint.
3. **Pull timeseries** per device over the requested window, day-chunked to dodge the per-key row cap, then merge all values reported in the same minute onto one row and write CSVs.

---

## Configuration

```bash
export TB_USERNAME='your-user@amrize.com'
export TB_PASSWORD='your-password'
```

Everything else is edited at the top of the script:

| Constant              | Default                                                | Meaning                                         |
|-----------------------|--------------------------------------------------------|-------------------------------------------------|
| `TB_URL`              | `https://iota.prd.cfops.biz`                           | ThingsBoard base URL                            |
| `DEVICE_TYPE`         | `"RMX Truck"`                                          | Device profile/type to filter on                |
| `OUTPUT_DIR`          | `./rmx_timeseries`                                     | Where CSVs are written                          |
| `START` / `END`       | 2026-06-04 -> 2026-06-05 (UTC)                         | Time window to export                           |
| `CHUNK_SECONDS`       | `86_400` (1 day)                                       | Size of each API request slice                  |
| `PER_REQUEST_LIMIT`   | `50_000`                                               | Max points **per key** per request              |
| `EXCLUDE_TRUCK_CODES` | `True`                                                 | Toggle to drop integer code columns from output |
| `TRUCK_CODE_KEYS`     | `chuteLockCode`, `drumChargeStateCode`, `drumModeCode` | The code columns the toggle controls            |

### Exclude Truck Codes

```python
EXCLUDE_TRUCK_CODES = True   # drop the integer code columns from CSV
```

- `True` -> the three integer code keys are **pulled from the API** but **omitted from the CSV** columns.
- `False` -> they appear as columns alongside their human-readable counterparts (`chuteLock`, `drumChargeState`, `drumMode`).

> **Note:** The API request always asks for all 28 keys regardless of this toggle - only the output columns (`OUTPUT_KEYS`) change. To exclude a different field, edit `TRUCK_CODE_KEYS`.

---

## Output Format

Comma-separated. Two kinds of file are written to `OUTPUT_DIR`:

### Per-device - `<device_name>.csv`

```
Timestamp,ambientTemp,chuteLock,currentGearCode,...,wheelSpeed
2026-06-04 18:55:00,27.0,locked,0,...,0.0
2026-06-04 18:56:00,27.0,locked,0,...,0.0
```

### Combined - `all_rmx_trucks.csv`

Same columns, prefixed with a `Device` column, sorted by `(device, timestamp)`:

```
Device,Timestamp,ambientTemp,chuteLock,...,wheelSpeed
RMX-Truck-042,2026-06-04 18:55:00,27.0,locked,...,0.0
```

> **Tip:** Blank cells are expected. Each row is one minute. A key only fills a cell if that key reported in that minute - sparse columns are normal for event-driven payloads.

Timestamps are formatted `YYYY-MM-DD HH:MM:SS` in **UTC**.

---

## ThingsBoard Endpoints Used

Link to [Swagger UI](https://iota.prd.cfops.biz/swagger-ui/#/)

| Purpose                   | Method & path                                                                  |
|---------------------------|--------------------------------------------------------------------------------|
| Login                     | `POST /api/auth/login`                                                         |
| Token refresh             | `POST /api/auth/token`                                                         |
| List devices by type      | `GET /api/tenant/devices?type=&pageSize=&page=`                                |
| **Historical timeseries** | `GET /api/plugins/telemetry/DEVICE/{id}/values/timeseries` (**getTimeseries**) |

> **Note - Endpoint choice:** The script uses **getTimeseries** (the GET with `startTs` / `endTs` / `agg` / `orderBy`), _not_ getLatestTimeseries (latest value only, no time range) and _not_ the POST `getTimeseriesByReadTsKvQueries` (same data, JSON-body queries). For an unbounded window of raw points, the GET is the simplest fit.

Timeseries query params sent: `keys`, `startTs`, `endTs`, `limit`, `agg=NONE` (raw points), `orderBy=ASC`, `useStrictDataTypes=true` (keeps numbers as numbers and code strings like `charge` / `locked` as strings).

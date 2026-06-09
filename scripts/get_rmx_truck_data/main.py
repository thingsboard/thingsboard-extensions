#!/usr/bin/env python3
import csv
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests

TB_URL = "https://iota.prd.cfops.biz"
USERNAME = os.environ["TB_USERNAME"]
PASSWORD = os.environ["TB_PASSWORD"]
DEVICE_TYPE = "RMX Truck"
OUTPUT_DIR = Path("./rmx_timeseries")

START = datetime(2026, 6, 4, 0, 0, 0, tzinfo=timezone.utc)
END = datetime(2026, 6, 5, 0, 0, 0, tzinfo=timezone.utc)
CHUNK_SECONDS = 86_400
PER_REQUEST_LIMIT = 50_000

KEYS = [
  "ambientTemp", "chuteLock", "chuteLockCode", "currentGearCode",
  "dischargeStateCode", "drumChargeState", "drumChargeStateCode",
  "drumCounter", "drumMode", "drumModeCode", "drumRPM", "drumSpeed",
  "engCoolantLevel", "engCoolantTemp", "engFuelRate", "engIntakePressure",
  "engOilLevel", "engOilPress", "engOilTemp", "engSpeed", "fuelLevel",
  "fuelUsed", "hydraulicPressure", "idleHours", "vehicleDistance",
  "vehicleHours", "waterAddedTotal", "wheelSpeed",
]

# When True, the integer code keys below are dropped from the CSV output.
# Set False to include them.
EXCLUDE_TRUCK_CODES = True

# Integer code keys excluded from the CSV output when EXCLUDE_TRUCK_CODES is True.
TRUCK_CODE_KEYS = ["chuteLockCode", "drumChargeStateCode", "drumModeCode"]

# Keys actually written to the CSVs (order preserved).
OUTPUT_KEYS = [
  k for k in KEYS
  if not (EXCLUDE_TRUCK_CODES and k in TRUCK_CODE_KEYS)
]


class TBClient:
  def __init__(self, url, username, password):
    self.url = url.rstrip("/")
    self.username = username
    self.password = password
    self.token = None
    self.refresh_token = None
    self.session = requests.Session()
    self._login()

  def _login(self):
    r = self.session.post(
      f"{self.url}/api/auth/login",
      json={"username": self.username, "password": self.password},
      timeout=30,
    )
    r.raise_for_status()
    body = r.json()
    self.token = body["token"]
    self.refresh_token = body["refreshToken"]

  def _headers(self):
    return {"X-Authorization": f"Bearer {self.token}"}

  def _refresh(self):
    try:
      r = self.session.post(
        f"{self.url}/api/auth/token",
        json={"refreshToken": self.refresh_token},
        timeout=30,
      )
      r.raise_for_status()
      self.token = r.json()["token"]
    except requests.HTTPError:
      self._login()

  def get(self, path, params=None):
    for attempt in range(2):
      r = self.session.get(
        f"{self.url}{path}", headers=self._headers(),
        params=params, timeout=60,
      )
      if r.status_code == 401 and attempt == 0:
        self._refresh()
        continue
      r.raise_for_status()
      return r.json()
    raise RuntimeError(f"Authentication failed for {path} after token refresh")

  def devices_by_type(self, device_type):
    devices, page = [], 0
    while True:
      body = self.get(
        "/api/tenant/devices",
        params={"type": device_type, "pageSize": 100, "page": page},
      )
      devices.extend(body.get("data", []))
      if not body.get("hasNext"):
        break
      page += 1
    return devices

  def timeseries(self, device_id, keys, start_ts, end_ts):
    merged = {}
    cursor = start_ts
    chunk_ms = CHUNK_SECONDS * 1000
    while cursor < end_ts:
      window_end = min(cursor + chunk_ms, end_ts)
      body = self.get(
        f"/api/plugins/telemetry/DEVICE/{device_id}/values/timeseries",
        params={
          "keys": ",".join(keys),
          "startTs": cursor,
          "endTs": window_end,
          "limit": PER_REQUEST_LIMIT,
          "agg": "NONE",
          "orderBy": "ASC",
          "useStrictDataTypes": "true",
        },
      )
      for key, points in body.items():
        for p in points:
          bucket = (p["ts"] // 60_000) * 60_000
          merged.setdefault(bucket, {})[key] = p["value"]
      cursor = window_end
    return merged


def to_ms(dt):
  return int(dt.timestamp() * 1000)


def write_wide_csv(path, key_order, rows):
  with path.open("w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["Timestamp"] + key_order)
    for ts in sorted(rows):
      stamp = datetime.fromtimestamp(ts / 1000, tz=timezone.utc)
      line = [stamp.strftime("%Y-%m-%d %H:%M:%S")]
      line += [rows[ts].get(k, "") for k in key_order]
      w.writerow(line)


def main():
  OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
  client = TBClient(TB_URL, USERNAME, PASSWORD)
  start_ts, end_ts = to_ms(START), to_ms(END)

  devices = client.devices_by_type(DEVICE_TYPE)
  if not devices:
    print(f"No devices of type '{DEVICE_TYPE}' found.", file=sys.stderr)
    return

  combined = {}
  for dev in devices:
    dev_id = dev["id"]["id"]
    dev_name = dev["name"]
    print(f"Pulling {dev_name} ({dev_id})", file=sys.stderr)
    rows = client.timeseries(dev_id, KEYS, start_ts, end_ts)
    safe_name = dev_name.replace("/", "_")
    write_wide_csv(OUTPUT_DIR / f"{safe_name}.csv", OUTPUT_KEYS, rows)
    for ts, vals in rows.items():
      combined.setdefault((dev_name, ts), {}).update(vals)

  combined_path = OUTPUT_DIR / "all_rmx_trucks.csv"
  with combined_path.open("w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["Device", "Timestamp"] + OUTPUT_KEYS)
    for dev_name, ts in sorted(combined):
      stamp = datetime.fromtimestamp(ts / 1000, tz=timezone.utc)
      line = [dev_name, stamp.strftime("%Y-%m-%d %H:%M:%S")]
      line += [combined[(dev_name, ts)].get(k, "") for k in OUTPUT_KEYS]
      w.writerow(line)

  print(f"Done. Output in {OUTPUT_DIR}/", file=sys.stderr)


if __name__ == "__main__":
  main()

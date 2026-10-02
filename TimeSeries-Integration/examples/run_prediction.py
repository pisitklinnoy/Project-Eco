"""Run after: python -m pip install ."""
import json
from pathlib import Path

import pandas as pd
from hatyai_timeseries import Forecaster

sample = pd.read_csv(Path(__file__).with_name("observations.csv"))
engine = Forecaster()
for station in ("X.173A", "X.90", "X.44"):
    result = engine.predict(sample, "2025-01-10T00:00:00+07:00", station=station)
    print(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False))

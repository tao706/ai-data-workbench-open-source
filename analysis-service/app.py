"""Small, deterministic data service. Only the Node gateway may call it."""

from __future__ import annotations

import math 
import os   
import time 
import uuid 
from pathlib import Path 
from typing import Any, Literal 

import numpy as np  
import pandas as pd  
from openpyxl import load_workbook 
from fastapi import FastAPI, HTTPException 
from pydantic import BaseModel, Field 

ROOT = Path(__file__).resolve().parent.parent 
UPLOADS = (ROOT / "backend" / "uploads").resolve() 
OUTPUT = (ROOT / "analysis-service" / "output").resolve() 
OUTPUT.mkdir(exist_ok=True) 
MAX_ROWS = 100_000 

app = FastAPI(title="AI Data Workbench Analysis Service", version="1.0.0")


class DatasetRequest(BaseModel):
    file: str


class PreviewRequest(DatasetRequest):
    offset: int = Field(0, ge=0) 
    limit: int = Field(100, ge=1, le=1000) 


class CleanRule(BaseModel):
    """清理规则模型"""
    operation: Literal["drop_missing", "fill_mean", "fill_median", "fill_mode", "fill_value", "drop_duplicates", "cast_number", "cast_text", "cast_date", "iqr_drop", "iqr_clip"]
    field: str | None = None 
    value: str | float | int | None = None 


class CleanRequest(DatasetRequest):
    """清理请求模型"""
    rules: list[CleanRule] = Field(min_length=1, max_length=20) 


class GroupRequest(DatasetRequest):
    """分组请求模型"""
    dimension: str 
    metric: str | None = None 
    aggregate: Literal["count", "sum", "mean", "min", "max"] = "count" 
    limit: int = Field(20, ge=1, le=100) 
    filter_field: str | None = None 
    filter_value: str | None = None 
    sort: Literal["asc", "desc"] = "desc" 


class ChartRequest(GroupRequest):
    """图表请求模型"""
    chart_type: Literal["bar", "line", "area", "pie", "scatter", "table"] = "bar" 



def safe_file(raw: str) -> Path:
    path = Path(raw).resolve() 
    
    if not (path.is_relative_to(UPLOADS) or path.is_relative_to(OUTPUT)) or not path.is_file():
        raise HTTPException(400, "Invalid dataset file")
    
    if path.suffix.lower() not in {".csv", ".xlsx"}:
        raise HTTPException(400, "Only CSV and XLSX are supported")
    
    if path.stat().st_size > 30 * 1024 * 1024:
        raise HTTPException(400, "File exceeds 30 MB")
    return path


def read_excel_tables(path: Path) -> pd.DataFrame:
    book = load_workbook(path, data_only=True) 
    frames = []
    try:
        
        for sheet in book.worksheets:
            
            if sheet.max_row > MAX_ROWS + 2:
                raise ValueError(f"工作表 {sheet.title} 超过 {MAX_ROWS} 行")
            rows = list(sheet.values)
            
            if not rows or not any(value is not None for row in rows for value in row):
                continue
            
            parent = list(rows[0])
            merged = [r for r in sheet.merged_cells.ranges if r.min_row == r.max_row == 1]
            double = bool(merged and len(rows) > 1 and all(isinstance(v, str) and v.strip() for v in rows[1]))
            if double:
                for area in merged:
                    for col in range(area.min_col - 1, area.max_col):
                        parent[col] = parent[area.min_col - 1]
                names = [f"{p}_{c}" if p is not None else str(c) for p, c in zip(parent, rows[1])]
            else:
                names = [str(value).strip() if value is not None else f"字段{i + 1}" for i, value in enumerate(parent)]
            used = set()
            for i, name in enumerate(names):
                candidate, suffix = name, 2
                while candidate in used:
                    candidate = f"{name}_{suffix}"
                    suffix += 1
                names[i] = candidate
                used.add(candidate)
            frame = pd.DataFrame(rows[2 if double else 1:], columns=names).dropna(how="all")
            if frame.empty:
                continue
            for name in frame.columns:
                values = frame[name].dropna()
                if len(values) and pd.to_numeric(values, errors="coerce").notna().all():
                    frame[name] = pd.to_numeric(frame[name])
            if frames and list(frame.columns) != list(frames[0][1].columns):
                raise ValueError("多个工作表字段不一致，请将需要分析的工作表单独另存后上传")
            frames.append((sheet.title, frame))
            if sum(len(f) for _, f in frames) > MAX_ROWS:
                raise ValueError(f"工作簿合计超过 {MAX_ROWS} 行")
        if not frames:
            raise ValueError("Excel 没有可读取的数据")
        if len(frames) > 1:
            source = "来源工作表"
            while source in frames[0][1].columns:
                source += "_来源"
            for title, frame in frames:
                frame[source] = title
        
        return pd.concat([frame for _, frame in frames], ignore_index=True)
    finally:
        book.close()


def read_df(raw: str) -> pd.DataFrame:
    path = safe_file(raw) 
    try:
        if path.suffix.lower() == ".xlsx":
            df = read_excel_tables(path) 
        else:
            try:
                
                df = pd.read_csv(path, nrows=MAX_ROWS + 1, encoding="utf-8-sig", sep=None, engine="python")
            except UnicodeDecodeError:
                
                df = pd.read_csv(path, nrows=MAX_ROWS + 1, encoding="gb18030", sep=None, engine="python")
    except Exception as exc:
        raise HTTPException(400, f"Cannot parse dataset: {exc}") from exc
    
    if df.empty or len(df.columns) == 0:
        raise HTTPException(400, "Dataset is empty")
    
    if len(df) > MAX_ROWS:
        raise HTTPException(400, f"Dataset exceeds {MAX_ROWS} rows")
    return df


def clean_json(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(k): clean_json(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [clean_json(v) for v in value]
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating, float)):
        return None if not math.isfinite(float(value)) else float(value)
    if isinstance(value, (pd.Timestamp,)):
        return value.isoformat()
    if pd.isna(value):
        return None
    return value


def field_info(df: pd.DataFrame) -> list[dict]:
    result = []
    for name in df.columns:
        s = df[name]
        kind = "number" if pd.api.types.is_numeric_dtype(s) else "date" if pd.api.types.is_datetime64_any_dtype(s) else "text"
        valid = s.dropna()
        
        
        ordered = valid if kind != "text" else valid.iloc[:0]
        result.append({"name": str(name), "type": kind, "missing": int(s.isna().sum()), "missingRate": round(float(s.isna().mean()) * 100, 2), "unique": int(s.nunique(dropna=True)), "min": clean_json(ordered.min()) if len(ordered) else None, "max": clean_json(ordered.max()) if len(ordered) else None})
    return result



def envelope(start: float, data: Any, warnings: list[str] | None = None) -> dict:
    return {"taskId": str(uuid.uuid4()), "status": "completed", "durationMs": round((time.time() - start) * 1000), "warnings": warnings or [], "data": clean_json(data)}



def require_field(df: pd.DataFrame, name: str | None) -> str:
    if not name or name not in df.columns:
        raise HTTPException(400, f"Unknown field: {name}")
    return name


def filtered_df(df: pd.DataFrame, req: GroupRequest) -> pd.DataFrame:
    if req.filter_field and req.filter_value not in (None, ""):
        field = require_field(df, req.filter_field)
        df = df.loc[df[field].astype(str) == req.filter_value]
    return df



@app.get("/internal/health")
def health():
    return {"status": "ok", "service": "fastapi", "pandas": pd.__version__}


@app.post("/internal/datasets/profile")
def profile(req: DatasetRequest):
    start = time.time() 
    df = read_df(req.file) 
    
    return envelope(start, {"rows": len(df), "columns": len(df.columns), "fields": field_info(df), "duplicates": int(df.duplicated().sum()), "preview": clean_json(df.head(20).to_dict("records"))})


@app.post("/internal/datasets/preview")
def preview(req: PreviewRequest):
    start = time.time() 
    df = read_df(req.file) 
    
    return envelope(start, {"rows": clean_json(df.iloc[req.offset:req.offset + req.limit].to_dict("records")), "total": len(df), "fields": list(map(str, df.columns))})


@app.post("/internal/datasets/clean")
def clean(req: CleanRequest):
    start = time.time() 
    df = read_df(req.file) 
    before = len(df) 
    changes = []
    for rule in req.rules:
        previous = len(df)
        op = rule.operation
        if op == "drop_duplicates":
            df = df.drop_duplicates()
        else:
            field = require_field(df, rule.field)
            if op == "drop_missing":
                df = df.dropna(subset=[field])
            elif op.startswith("fill_"):
                s = df[field]
                if op in {"fill_mean", "fill_median"}:
                    numeric = pd.to_numeric(s, errors="coerce")
                    if numeric.notna().sum() == 0:
                        raise HTTPException(400, f"{field} has no numeric values")
                    value = numeric.mean() if op == "fill_mean" else numeric.median()
                    df[field] = numeric.fillna(value)
                elif op == "fill_mode":
                    mode = s.mode(dropna=True)
                    if mode.empty:
                        raise HTTPException(400, f"{field} has no mode")
                    df[field] = s.fillna(mode.iloc[0])
                elif op == "fill_value":
                    if rule.value is None:
                        raise HTTPException(400, "fill_value requires value")
                    df[field] = s.fillna(rule.value)
            elif op == "cast_number":
                df[field] = pd.to_numeric(df[field], errors="coerce")
            elif op == "cast_text":
                df[field] = df[field].astype("string")
            elif op == "cast_date":
                df[field] = pd.to_datetime(df[field], errors="coerce")
            elif op.startswith("iqr_"):
                numeric = pd.to_numeric(df[field], errors="coerce")
                if numeric.notna().sum() < 4:
                    raise HTTPException(400, f"{field} needs at least 4 numeric values")
                q1, q3 = numeric.quantile([0.25, 0.75])
                low, high = q1 - 1.5 * (q3 - q1), q3 + 1.5 * (q3 - q1)
                df = df.loc[numeric.between(low, high) | numeric.isna()] if op == "iqr_drop" else df.assign(**{field: numeric.clip(low, high)})
        changes.append({"operation": op, "field": rule.field, "affectedRows": previous - len(df)})
    if df.empty:
        raise HTTPException(400, "Cleaning removed every row")
    output = OUTPUT / f"{uuid.uuid4().hex}.csv"
    df.to_csv(output, index=False, encoding="utf-8-sig")
    return envelope(start, {"file": str(output), "beforeRows": before, "afterRows": len(df), "changes": changes, "fields": field_info(df)})


@app.post("/internal/analysis/descriptive")
def descriptive(req: DatasetRequest):
    start = time.time() 
    df = read_df(req.file) 
    
    numeric = df.select_dtypes(include="number")
    stats = {}
    for name in numeric.columns:
        s = numeric[name].dropna()
        if len(s):
            stats[str(name)] = {"count": len(s), "mean": s.mean(), "median": s.median(), "std": s.std(), "min": s.min(), "q1": s.quantile(.25), "q3": s.quantile(.75), "max": s.max()}
    return envelope(start, {"fields": field_info(df), "numeric": stats, "duplicates": int(df.duplicated().sum())})


@app.post("/internal/analysis/groupby")
def groupby(req: GroupRequest):
    start = time.time() 
    df = filtered_df(read_df(req.file), req)
    grouped = aggregate_values(df, req)
    grouped = grouped.sort_values(ascending=req.sort == "asc").head(req.limit)
    return envelope(start, {"categories": [str(x) for x in grouped.index], "series": clean_json(grouped.tolist()), "metadata": {"dimension": req.dimension, "metric": req.metric, "aggregate": req.aggregate}})


def aggregate_values(df: pd.DataFrame, req: GroupRequest):
    dim = require_field(df, req.dimension)
    if req.aggregate == "count":
        grouped = df.groupby(dim, dropna=False).size()
    else:
        metric = require_field(df, req.metric)
        values = pd.to_numeric(df[metric], errors="coerce")
        if values.notna().sum() == 0:
            raise HTTPException(400, f"{metric} is not numeric")
        grouped = df.assign(**{metric: values}).groupby(dim, dropna=False)[metric].agg(req.aggregate)
    return grouped


@app.post("/internal/analysis/correlation")
def correlation(req: DatasetRequest):
    start = time.time() 
    df = read_df(req.file).select_dtypes(include="number")
    if len(df.columns) < 2:
        raise HTTPException(400, "At least two numeric fields are required")
    return envelope(start, {"fields": list(map(str, df.columns)), "matrix": clean_json(df.corr().values.tolist())})


@app.post("/internal/analysis/chart-data")
def chart_data(req: ChartRequest):
    if req.chart_type == "scatter":
        start = time.time() 
        df = filtered_df(read_df(req.file), req)
        x = require_field(df, req.dimension)
        y = require_field(df, req.metric)
        if not all(pd.api.types.is_numeric_dtype(df[field]) for field in (x, y)):
            raise HTTPException(400, "散点图的 X 轴和 Y 轴都需要选择数值字段")
        pairs = df[[x, y]].replace([np.inf, -np.inf], np.nan).dropna()
        points = pairs.head(req.limit).values.tolist()
        return envelope(start, {"points": points, "metadata": {"dimension": x, "metric": y, "totalPoints": len(pairs), "shownPoints": len(points), "note": f"按原始行顺序展示前 {len(points)} 个有效点，共 {len(pairs)} 个；不做聚合"}})
    start = time.time()
    df = filtered_df(read_df(req.file), req)
    grouped = aggregate_values(df, req)
    note = ""
    if req.chart_type == "pie":
        if req.aggregate not in {"count", "sum"}:
            raise HTTPException(400, "饼图占比仅支持计数或求和")
        if req.aggregate == "sum" and (pd.to_numeric(df[req.metric], errors="coerce") < 0).any():
            raise HTTPException(400, "饼图不能表达包含负数的指标，请改用柱状图或选择非负指标")
        if not np.isfinite(grouped.to_numpy(dtype=float)).all() or grouped.sum() <= 0:
            raise HTTPException(400, "饼图需要有限的非负数值，且合计大于零")
        ordered = grouped.sort_values(ascending=False)
        grouped = ordered.head(req.limit)
        if len(ordered) > req.limit:
            label = "其他（合并）"
            while label in ordered.index:
                label += "_"
            grouped = pd.concat([grouped, pd.Series([ordered.iloc[req.limit:].sum()], index=[label])])
        note = "展示前 N 项及其他类别，比例以筛选后的全部数据为分母"
    elif req.chart_type in {"line", "area"}:
        grouped = grouped.sort_index(ascending=req.sort == "asc").head(req.limit)
        note = "按横轴值排序；文字字段按文字顺序，数值字段按数值顺序"
    else:
        grouped = grouped.sort_values(ascending=req.sort == "asc").head(req.limit)
        note = "按聚合结果排序；数据表展示聚合结果"
    return envelope(start, {"categories": [str(x) for x in grouped.index], "series": clean_json(grouped.tolist()), "metadata": {"note": note, "dimension": req.dimension, "metric": req.metric, "aggregate": req.aggregate}})

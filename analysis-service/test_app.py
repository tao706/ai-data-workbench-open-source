import tempfile
import unittest
from pathlib import Path
import pandas as pd
from openpyxl import Workbook

from app import (
    UPLOADS, ChartRequest, CleanRequest, CleanRule, DatasetRequest,
    GroupRequest, chart_data, clean, descriptive, groupby, profile, read_excel_tables, field_info,
)


class DataServiceTests(unittest.TestCase):
    def test_merged_headers_and_multiple_sheets(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "merged.xlsx"
            book = Workbook()
            for index, sheet in enumerate([book.active, book.create_sheet("second")]):
                sheet.append(["顶点1", None, "顶点2", None])
                sheet.merge_cells("A1:B1")
                sheet.merge_cells("C1:D1")
                sheet.append(["X", "Y", "X", "Y"])
                sheet.append([index, 2, 3, 4])
            book.save(path)
            book.close()
            frame = read_excel_tables(path)
            self.assertEqual(len(frame), 2)
            self.assertEqual(list(frame.columns), ["顶点1_X", "顶点1_Y", "顶点2_X", "顶点2_Y", "来源工作表"])
            self.assertEqual(sum(f["type"] == "number" for f in field_info(frame)), 4)

    def test_mixed_text_and_number_profile(self):
        fields = field_info(pd.DataFrame({"mixed": ["X", 1, None]}))
        self.assertEqual(fields[0]["type"], "text")
        self.assertIsNone(fields[0]["min"])
        self.assertEqual(fields[0]["missing"], 1)

    def setUp(self):
        UPLOADS.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(mode="w", suffix=".csv", dir=UPLOADS, delete=False, encoding="utf-8") as handle:
            handle.write("region,sales,orders\nEast,10,2\nEast,20,4\nWest,30,6\nWest,,8\nWest,30,6\n")
            self.file = str(Path(handle.name).resolve())

    def tearDown(self):
        Path(self.file).unlink(missing_ok=True)

    def test_profile_and_descriptive(self):
        result = profile(DatasetRequest(file=self.file))["data"]
        self.assertEqual(result["rows"], 5)
        self.assertEqual(result["duplicates"], 1)
        self.assertEqual(result["fields"][1]["missing"], 1)
        stats = descriptive(DatasetRequest(file=self.file))["data"]["numeric"]
        self.assertEqual(stats["sales"]["mean"], 22.5)

    def test_clean_creates_new_version(self):
        result = clean(CleanRequest(file=self.file, rules=[CleanRule(operation="drop_duplicates"), CleanRule(operation="fill_mean", field="sales")]))["data"]
        self.assertEqual(result["beforeRows"], 5)
        self.assertEqual(result["afterRows"], 4)
        self.assertTrue(Path(result["file"]).exists())
        Path(result["file"]).unlink(missing_ok=True)

    def test_groupby_and_chart(self):
        result = groupby(GroupRequest(file=self.file, dimension="region", metric="sales", aggregate="sum"))["data"]
        self.assertEqual(dict(zip(result["categories"], result["series"])), {"West": 60.0, "East": 30.0})
        chart = chart_data(ChartRequest(file=self.file, dimension="region", metric="sales", aggregate="sum", chart_type="bar"))["data"]
        self.assertEqual(chart["series"], result["series"])

    def test_chart_semantics(self):
        pie = chart_data(ChartRequest(file=self.file, dimension="region", metric="sales", aggregate="sum", chart_type="pie", limit=1))["data"]
        self.assertEqual(sum(pie["series"]), 90)
        self.assertEqual(len(pie["series"]), 2)
        line = chart_data(ChartRequest(file=self.file, dimension="sales", metric="orders", aggregate="sum", chart_type="line", sort="asc"))["data"]
        self.assertEqual(line["categories"][:3], ["10.0", "20.0", "30.0"])
        scatter = chart_data(ChartRequest(file=self.file, dimension="sales", metric="orders", chart_type="scatter", limit=2))["data"]
        self.assertEqual(scatter["points"], [[10, 2], [20, 4]])
        self.assertEqual(scatter["metadata"]["totalPoints"], 4)
        from fastapi import HTTPException
        Path(self.file).write_text("region,sales,orders\nEast,-1,2\nWest,3,4\n", encoding="utf-8")
        with self.assertRaises(HTTPException):
            chart_data(ChartRequest(file=self.file, dimension="region", metric="sales", aggregate="sum", chart_type="pie"))


if __name__ == "__main__":
    unittest.main()

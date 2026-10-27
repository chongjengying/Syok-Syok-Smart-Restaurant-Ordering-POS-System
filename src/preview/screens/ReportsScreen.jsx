import { useState } from "react";
import { BarChart3, FileText, FileSpreadsheet } from "lucide-react";
import {
  PageTitle,
  Button,
  SearchField,
  EmptyState,
} from "../components/ui.jsx";
import {
  mockReportTypes,
  businessDate,
  generateMockReport,
  exportMockReport,
} from "../services/mockReportService.js";

export default function ReportsScreen({ pos }) {
  const [type, setType] = useState("daily-sales");
  const [from, setFrom] = useState(businessDate());
  const [to, setTo] = useState(businessDate());
  const [report, setReport] = useState(null);
  const [search, setSearch] = useState("");
  const rows =
    report?.rows.filter((row) =>
      row.join(" ").toLowerCase().includes(search.toLowerCase()),
    ) || [];
  return (
    <div className="pv-page">
      <PageTitle
        eyebrow="SEE THE BIGGER PICTURE"
        title="A little insight goes a long way."
        description="Generate reports from your local sample orders and payments."
      />
      <section className="pv-panel">
        <h2>Generate a report</h2>
        <form
          className="pv-report-filters"
          onSubmit={(event) => {
            event.preventDefault();
            pos.run(
              () => generateMockReport(pos.data, type, from, to),
              (result) => {
                setReport(result);
                setSearch("");
              },
            );
          }}
        >
          <label className="pv-field">
            <span>Report</span>
            <select
              value={type}
              onChange={(event) => setType(event.target.value)}
            >
              {mockReportTypes.map(([id, title]) => (
                <option key={id} value={id}>
                  {title}
                </option>
              ))}
            </select>
          </label>
          <label className="pv-field">
            <span>From</span>
            <input
              required
              type="date"
              aria-label="Report from"
              max={to}
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>
          <label className="pv-field">
            <span>To</span>
            <input
              required
              type="date"
              aria-label="Report to"
              min={from}
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </label>
          <Button disabled={pos.busy}>Generate preview</Button>
        </form>
      </section>
      {report ? (
        <section className="pv-panel pv-report-result">
          <div className="pv-panel-heading">
            <div>
              <h2>{report.title}</h2>
              <p className="pv-muted">
                {report.from} – {report.to} · Mock data
              </p>
            </div>
            <div className="pv-report-exports">
              <Button
                variant="secondary"
                icon={FileText}
                disabled={pos.busy}
                onClick={() =>
                  pos.run(() => exportMockReport({ ...report, rows }, "pdf"))
                }
              >
                Export PDF
              </Button>
              <Button
                variant="secondary"
                icon={FileSpreadsheet}
                disabled={pos.busy}
                onClick={() =>
                  pos.run(() => exportMockReport({ ...report, rows }, "excel"))
                }
              >
                Export Excel
              </Button>
            </div>
          </div>
          <SearchField
            label="Search report"
            placeholder="Search generated report…"
            value={search}
            onChange={setSearch}
          />
          <div className="pv-report-table">
            <table>
              <thead>
                <tr>
                  {report.columns.map((column) => (
                    <th key={column}>{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={index}>
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && (
              <EmptyState
                icon={BarChart3}
                title="No records in this view"
                description="Try another period or search."
              />
            )}
          </div>
          <p className="pv-fine-print">
            {rows.length} records · Exports contain mock data only.
          </p>
        </section>
      ) : (
        <EmptyState
          icon={BarChart3}
          title="Your service, in perspective"
          description="Choose a report and date range, then generate a preview."
        />
      )}
    </div>
  );
}

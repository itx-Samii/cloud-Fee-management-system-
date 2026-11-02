/**
 * Client-side utility for exporting JSON data to CSV
 */
export function exportToCSV<T extends object>(data: T[], filename: string, headers: {[key: string]: string}) {
  if (!data || !data.length) {
    alert("No data available to export");
    return;
  }

  // 1. Create CSV header row
  const headerKeys = Object.keys(headers);
  const headerLabels = Object.values(headers);
  let csvContent = headerLabels.join(",") + "\n";

  // 2. Add data rows
  data.forEach(item => {
    const fields = item as Record<string, unknown>;
    const row = headerKeys.map(key => {
      const val = fields[key] !== undefined ? fields[key] : "";
      // Escape commas and wrap in quotes for safety
      const stringified = String(val).replace(/"/g, '""');
      return `"${stringified}"`;
    });
    csvContent += row.join(",") + "\n";
  });

  // 3. Create blob and download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

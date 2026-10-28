import { DataTable, type DataTableProps } from "./DataTable";

export type DataGridProps<T> = DataTableProps<T>;

/** Compatibility alias; all table states are owned by DataTable. */
export function DataGrid<T>(props: DataGridProps<T>) {
  return <DataTable {...props} />;
}

export default DataGrid;

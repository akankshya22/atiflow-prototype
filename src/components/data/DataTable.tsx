import type { ReactNode } from 'react';
import type { Selection } from 'react-aria-components';
import { Table } from '@/components/application/table/table';
import { cx } from '@/utils/cx';

export interface Column<T> {
  id: string; header: string; cell(row: T): ReactNode;
  /** Tooltip on a help icon next to the heading. */
  hint?: string;
  /** Classes for the cell / the heading (width, alignment...). */
  className?: string; headClassName?: string;
}
export interface RowSelection {
  selected: Set<string>; onChange(next: Set<string>): void;
  /** Rows shown checked but not changeable (e.g. already added). */
  locked?: Set<string>;
  /** Rows that cannot be selected and are shown unchecked (e.g. invalid). */
  disabled?: Set<string>;
}
interface Props<T> {
  label: string; rows: T[]; rowKey(row: T): string; columns: Column<T>[];
  /** Makes rows clickable (keyboard accessible). */
  onRowAction?(row: T): void;
  selection?: RowSelection;
  /** Keep the heading row visible while the body scrolls (use inside a height-limited box). */
  stickyHeader?: boolean; minWidth?: number;
  /** No zebra striping and a white heading row (flat tables inside a card). */
  plain?: boolean;
}

/**
 * Generic list table (Untitled UI Table): striped rows, optional row action, optional checkbox selection with locked rows.
 * Each row is a `group`, so cells can reveal controls on row hover with `opacity-0 group-hover:opacity-100`.
 */
export function DataTable<T>({ label, rows, rowKey, columns, onRowAction, selection, stickyHeader, minWidth, plain }: Props<T>) {
  const locked = selection?.locked ?? new Set<string>(); const disabled = new Set([...locked, ...(selection?.disabled ?? [])]);
  const selectedKeys = selection ? new Set([...selection.selected, ...locked]) : undefined;
  const onSelectionChange = (keys: Selection) => {
    if (!selection) return;
    const next = keys === 'all' ? rows.map(rowKey) : [...keys].map(String);
    selection.onChange(new Set(next.filter((k) => !disabled.has(k))));
  };
  return (
    <Table aria-label={label} size="sm" style={minWidth ? { minWidth } : undefined} {...(selection ? { selectionMode: 'multiple' as const, selectedKeys, onSelectionChange, disabledKeys: disabled } : {})}>
      <Table.Header className={plain ? 'bg-primary' : undefined}>
        {columns.map((c, i) => <Table.Head key={c.id} id={c.id} isRowHeader={i === 0} label={c.header} tooltip={c.hint} className={cx(stickyHeader && 'sticky top-0 z-10', (plain ? 'bg-primary' : stickyHeader && 'bg-secondary'), c.headClassName)} />)}
      </Table.Header>
      <Table.Body>
        {rows.map((r) => (
          <Table.Row key={rowKey(r)} id={rowKey(r)} onAction={onRowAction ? () => onRowAction(r) : undefined} className={cx('group h-auto', !plain && 'even:bg-secondary', onRowAction && 'cursor-pointer')}>
            {columns.map((c) => <Table.Cell key={c.id} className={cx('px-4 py-3', c.className)}>{c.cell(r)}</Table.Cell>)}
          </Table.Row>
        ))}
      </Table.Body>
    </Table>
  );
}

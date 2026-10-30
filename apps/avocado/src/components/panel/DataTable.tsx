'use client'

import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'

/** Sin acentos y en minúsculas, para que "garcia" encuentre "García". */
const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export interface TableFilter<T> {
  /** Lo que lee un lector de pantalla para el grupo de botones. */
  label: string
  /** La opción "Todos" se agrega sola. */
  options: { value: string; label: string }[]
  test: (row: T, value: string) => boolean
}

interface DataTableProps<T> {
  rows: T[]
  rowKey: (row: T) => string
  /** El `<tr>` de los encabezados. */
  head: ReactNode
  /** El `<tr>` de una fila (sin `key`: la pone la tabla). */
  renderRow: (row: T) => ReactNode
  /** Con esto la tabla tiene buscador: el texto de la fila donde se busca. */
  searchText?: (row: T) => string
  searchLabel?: string
  filter?: TableFilter<T>
  pageSize?: number
  empty?: string
}

/**
 * La tabla de todo el panel: buscador, filtro opcional y páginas, igual que la de Usuarios.
 * Trabaja sobre las filas que ya llegaron (la de Usuarios pagina en el servidor porque son miles).
 */
export function DataTable<T>({ rows, rowKey, head, renderRow, searchText, searchLabel = 'Buscar', filter, pageSize = 10, empty = 'Nada coincide con la búsqueda.' }: DataTableProps<T>) {
  const [query, setQuery] = useState('')
  const [filterValue, setFilterValue] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => { setPage(1) }, [query, filterValue, rows.length])

  const filtered = useMemo(() => {
    const needle = fold(query.trim())
    return rows.filter(row => {
      if (filter && filterValue && !filter.test(row, filterValue)) return false
      if (searchText && needle && !fold(searchText(row)).includes(needle)) return false
      return true
    })
  }, [rows, query, filterValue, searchText, filter])

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const current = Math.min(page, pages)
  const shown = filtered.slice((current - 1) * pageSize, current * pageSize)
  const from = filtered.length === 0 ? 0 : (current - 1) * pageSize + 1
  const to = Math.min(current * pageSize, filtered.length)
  const needsToolbar = !!searchText || !!filter

  return (
    <>
      {needsToolbar && (
        <div className="panel-toolbar">
          {searchText && (
            <input className="panel-search" type="search" placeholder={searchLabel} aria-label={searchLabel} value={query} onChange={event => setQuery(event.target.value)} />
          )}
          {filter && (
            <div className="panel-filter" role="group" aria-label={filter.label}>
              {[{ value: '', label: 'Todos' }, ...filter.options].map(option => (
                <button key={option.value} type="button" aria-pressed={filterValue === option.value} onClick={() => setFilterValue(option.value)}>{option.label}</button>
              ))}
            </div>
          )}
        </div>
      )}

      {filtered.length === 0 ? <p className="panel-muted" role="status">{empty}</p> : (
        <div className="panel-table-wrap">
          <table className="panel-table">
            <thead>{head}</thead>
            <tbody>{shown.map(row => <Fragment key={rowKey(row)}>{renderRow(row)}</Fragment>)}</tbody>
          </table>
        </div>
      )}

      {rows.length > pageSize || needsToolbar ? (
        <div className="panel-pager">
          <span>{filtered.length > 0 ? `${from}–${to} de ${filtered.length.toLocaleString('es-MX')}` : 'Sin resultados'}</span>
          <div>
            <button type="button" disabled={current <= 1} onClick={() => setPage(current - 1)}>Anterior</button>
            <button type="button" disabled={current >= pages} onClick={() => setPage(current + 1)}>Siguiente</button>
          </div>
        </div>
      ) : null}
    </>
  )
}

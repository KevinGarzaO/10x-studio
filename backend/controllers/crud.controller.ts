import { Request, Response } from 'express'
import { CrudService } from '../services/crud.service'

export const getCollection = (table: string) => async (req: Request, res: Response) => {
  try {
    const data = await CrudService.getCollection(table)
    res.json(data)
  } catch {
    res.status(500).json({ error: `Error fetching ${table}` })
  }
}

export const saveCollection = (table: string) => async (req: Request, res: Response) => {
  try {
    await CrudService.saveCollection(table, req.body)
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: `Error saving ${table}` })
  }
}

export const createItem = (table: string) => async (req: Request, res: Response) => {
  try {
    await CrudService.createItem(table, req.body)
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: `Error creating ${table}` })
  }
}

export const updateItem = (table: string) => async (req: Request, res: Response) => {
  try {
    await CrudService.updateItem(table, req.body)
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: `Error updating ${table}` })
  }
}

export const deleteItem = (table: string) => async (req: Request, res: Response) => {
  try {
    await CrudService.deleteItem(table, req.body.id)
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: `Error deleting ${table}` })
  }
}

export const getSingular = (table: string, fallback: any) => async (req: Request, res: Response) => {
  try {
    const data = await CrudService.getSingular(table, fallback)
    res.json(data)
  } catch {
    res.status(500).json({ error: `Error fetching ${table}` })
  }
}

export const saveSingular = (table: string) => async (req: Request, res: Response) => {
  try {
    await CrudService.saveSingular(table, req.body)
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: `Error saving ${table}` })
  }
}

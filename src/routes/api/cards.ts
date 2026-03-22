// src/routes/cards.ts
import { Hono } from 'hono';
import type { Env, Card, CardInput, CardUpdate } from '../types';
import { verifyToken } from './auth'; // Importar la función verifyToken

export const cardsRoutes = new Hono<{ Bindings: Env }>();

// Middleware para verificar autenticación
async function authMiddleware(c: any, next: any) {
    const authHeader = c.req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return c.json({ detail: 'Authentication required' }, 401);
    }
    
    const token = authHeader.substring(7);
    const payload = await verifyToken(token, c.env.JWT_SECRET);
    
    if (!payload) {
        return c.json({ detail: 'Invalid or expired token' }, 401);
    }
    
    c.set('userId', payload.user_id);
    await next();
}

// GET /api/cards - Obtener todas las tarjetas del usuario
cardsRoutes.get('/', authMiddleware, async (c) => {
    const userId = c.get('userId');
    
    const cards = await c.env.DB.prepare(
        'SELECT id, user_id, title, description, image_url, created_at, updated_at FROM cards WHERE user_id = ? ORDER BY created_at DESC'
    ).bind(userId).all();
    
    return c.json(cards.results);
});

// GET /api/cards/:id - Obtener una tarjeta específica
cardsRoutes.get('/:id', authMiddleware, async (c) => {
    const userId = c.get('userId');
    const id = c.req.param('id');
    
    const card = await c.env.DB.prepare(
        'SELECT id, user_id, title, description, image_url, created_at, updated_at FROM cards WHERE id = ? AND user_id = ?'
    ).bind(id, userId).first<Card>();
    
    if (!card) {
        return c.json({ detail: 'Card not found' }, 404);
    }
    
    return c.json(card);
});

// POST /api/cards - Crear nueva tarjeta
cardsRoutes.post('/', authMiddleware, async (c) => {
    const userId = c.get('userId');
    const body: CardInput = await c.req.json();
    
    if (!body.title) {
        return c.json({ detail: 'Title is required' }, 400);
    }
    
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    
    await c.env.DB.prepare(
        'INSERT INTO cards (id, user_id, title, description, image_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, userId, body.title, body.description || null, body.image_url || null, now, now).run();
    
    const newCard = await c.env.DB.prepare(
        'SELECT id, user_id, title, description, image_url, created_at, updated_at FROM cards WHERE id = ?'
    ).bind(id).first<Card>();
    
    return c.json(newCard, 201);
});

// PUT /api/cards/:id - Actualizar tarjeta
cardsRoutes.put('/:id', authMiddleware, async (c) => {
    const userId = c.get('userId');
    const id = c.req.param('id');
    const body: CardUpdate = await c.req.json();
    
    // Verificar que la tarjeta existe y pertenece al usuario
    const existing = await c.env.DB.prepare(
        'SELECT id FROM cards WHERE id = ? AND user_id = ?'
    ).bind(id, userId).first();
    
    if (!existing) {
        return c.json({ detail: 'Card not found' }, 404);
    }
    
    const now = new Date().toISOString();
    
    // Construir la consulta dinámicamente
    const updates: string[] = [];
    const values: any[] = [];
    
    if (body.title !== undefined) {
        updates.push('title = ?');
        values.push(body.title);
    }
    if (body.description !== undefined) {
        updates.push('description = ?');
        values.push(body.description);
    }
    if (body.image_url !== undefined) {
        updates.push('image_url = ?');
        values.push(body.image_url);
    }
    
    if (updates.length === 0) {
        return c.json({ detail: 'No fields to update' }, 400);
    }
    
    updates.push('updated_at = ?');
    values.push(now);
    values.push(id);
    values.push(userId);
    
    await c.env.DB.prepare(
        `UPDATE cards SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`
    ).bind(...values).run();
    
    const updatedCard = await c.env.DB.prepare(
        'SELECT id, user_id, title, description, image_url, created_at, updated_at FROM cards WHERE id = ?'
    ).bind(id).first<Card>();
    
    return c.json(updatedCard);
});

// DELETE /api/cards/:id - Eliminar tarjeta
cardsRoutes.delete('/:id', authMiddleware, async (c) => {
    const userId = c.get('userId');
    const id = c.req.param('id');
    
    const result = await c.env.DB.prepare(
        'DELETE FROM cards WHERE id = ? AND user_id = ?'
    ).bind(id, userId).run();
    
    if (result.meta.changes === 0) {
        return c.json({ detail: 'Card not found' }, 404);
    }
    
    return c.body(null, 204);
});

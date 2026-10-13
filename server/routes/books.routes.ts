import type { Express } from "express";
import { z } from "zod";

import { storage } from "../storage";
import { pdfService } from "../services/pdfService";
import { requireAuth, requireStaff } from "../middleware/requireAuth";

/**
 * Libro de Reclamaciones books, their PDF export and settings.
 */
export function registerBooksRoutes(app: Express): void {
  // Books routes
  app.get('/api/books', requireAuth, async (req: any, res) => {
    try {
      const books = await storage.getBooks(req.user.businessId);
      res.json(books);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch books" });
    }
  });

  app.post('/api/books', requireAuth, requireStaff, async (req: any, res) => {
    try {
      const { establishmentId, bookType, description } = req.body;

      if (!establishmentId) {
        return res.status(400).json({ message: "El establecimiento es requerido" });
      }

      // Ensure the establishment belongs to the authenticated business
      const establishment = await storage.getEstablishment(establishmentId);
      if (!establishment || establishment.businessId !== req.user.businessId) {
        return res.status(404).json({ message: "Establecimiento no encontrado" });
      }

      const book = await storage.createBook({
        businessId: req.user.businessId,
        establishmentId,
        bookType: bookType || 'reclamos',
        description: description || null,
        isActive: true,
      });

      res.status(201).json(book);
    } catch (error) {
      console.error('Error creating book:', error);
      res.status(500).json({ message: "Failed to create book" });
    }
  });

  app.get('/api/books/:id/download', requireAuth, async (req: any, res) => {
    try {
      const books = await storage.getBooks(req.user.businessId);
      const book = books.find(b => b.id === req.params.id);

      if (!book) {
        return res.status(404).json({ message: "Libro no encontrado" });
      }

      const business = await storage.getBusiness(req.user.businessId);
      if (!business) {
        return res.status(404).json({ message: "Empresa no encontrada" });
      }

      const complaints = await storage.getComplaintsByEstablishment(book.establishmentId);

      const pdf = await pdfService.generateComplaintReport(complaints, business, {
        establishment: book.establishmentName,
        bookType: book.bookType,
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="libro-${book.bookType}-${book.establishmentId}.pdf"`
      );
      res.send(pdf);
    } catch (error) {
      console.error('Error generating book PDF:', error);
      res.status(500).json({ message: "Failed to download book" });
    }
  });

  // Update a book ("Gestionar" on Libros)
  app.patch('/api/books/:id', requireAuth, requireStaff, async (req: any, res) => {
    try {
      const books = await storage.getBooks(req.user.businessId);
      const book = books.find(b => b.id === req.params.id);

      if (!book) {
        return res.status(404).json({ message: "Libro no encontrado" });
      }

      const schema = z.object({
        description: z.string().max(500).nullable().optional(),
        isActive: z.boolean().optional(),
      });
      const data = schema.parse(req.body);

      // Books are read through getBooks; persist the change and re-read it.
      const updated = await storage.updateBook(req.params.id, data);
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Datos inválidos", errors: error.errors });
      }
      console.error('Error updating book:', error);
      res.status(500).json({ message: "Failed to update book" });
    }
  });
}

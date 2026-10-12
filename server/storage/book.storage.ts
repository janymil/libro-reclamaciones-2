import { db } from "../db";
import { eq, desc, count } from "drizzle-orm";
import {
  type Book,
  type InsertBook,
  establishments,
  books,
  complaints,
} from "@shared/schema";
import type {
  BookSummary,
} from "./types";

/** Data access for the "book" aggregate. */
export const bookStorage = {
  async getBooks(businessId: string): Promise<BookSummary[]> {
    const bookRows = await db
      .select()
      .from(books)
      .where(eq(books.businessId, businessId))
      .orderBy(desc(books.createdAt));

    if (bookRows.length === 0) {
      return [];
    }

    const establishmentRows = await db
      .select({ id: establishments.id, name: establishments.name })
      .from(establishments)
      .where(eq(establishments.businessId, businessId));
    const establishmentNames = new Map<string, string>(
      establishmentRows.map((row): [string, string] => [row.id, row.name])
    );

    const entryCounts = await db
      .select({ establishmentId: complaints.establishmentId, count: count() })
      .from(complaints)
      .where(eq(complaints.businessId, businessId))
      .groupBy(complaints.establishmentId);
    const entriesMap = new Map<string, number>(
      entryCounts.map((row): [string, number] => [row.establishmentId, row.count])
    );

    return bookRows.map(book => ({
      id: book.id,
      businessId: book.businessId,
      establishmentId: book.establishmentId,
      establishmentName: establishmentNames.get(book.establishmentId) ?? 'Establecimiento principal',
      bookType: book.bookType,
      description: book.description,
      entriesCount: entriesMap.get(book.establishmentId) ?? 0,
      isActive: book.isActive,
      createdAt: book.createdAt,
    }));
  },

  async createBook(bookData: InsertBook): Promise<Book> {
    const [book] = await db
      .insert(books)
      .values(bookData)
      .returning();
    return book;
  },

  async updateBook(id: string, updates: Partial<InsertBook>): Promise<Book> {
    const [book] = await db
      .update(books)
      .set({ ...updates })
      .where(eq(books.id, id))
      .returning();
    return book;
  },
};

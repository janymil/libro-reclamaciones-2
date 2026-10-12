import { db } from "../db";
import { eq, and, desc, gte, inArray } from "drizzle-orm";
import {
  users,
  businesses,
  establishments,
  books,
  complaints,
  complaintAuditLog,
  authAuditLog,
} from "@shared/schema";
import type {
  HistoryFilters,
  ActivityEntry,
  AuditLogEntry,
  SystemChange,
} from "./types";
import { APP_VERSION } from "./types";
import { libroStorage } from "./libro.storage";

/** Data access for the "history" aggregate. */
export const historyStorage = {
  async getActivityHistory(businessId: string, filters: HistoryFilters): Promise<ActivityEntry[]> {
    const dateRange = filters.dateRange && filters.dateRange > 0 ? filters.dateRange : 30;
    const since = new Date(Date.now() - dateRange * 24 * 60 * 60 * 1000);

    const businessUsers = await db
      .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email })
      .from(users)
      .where(eq(users.businessId, businessId));

    const nameById = new Map<string, string>(
      businessUsers.map((user): [string, string] => [
        user.id,
        `${user.firstName} ${user.lastName}`.trim() || user.email,
      ])
    );

    const entries: ActivityEntry[] = [];

    if (businessUsers.length > 0) {
      const authRows = await db
        .select()
        .from(authAuditLog)
        .where(and(
          inArray(authAuditLog.userId, businessUsers.map(user => user.id)),
          gte(authAuditLog.createdAt, since)
        ))
        .orderBy(desc(authAuditLog.createdAt))
        .limit(100);

      for (const row of authRows) {
        entries.push({
          id: row.id,
          action: row.action,
          description: `${row.action} · ${row.email}${row.success ? '' : ` (${row.failureReason ?? 'fallido'})`}`,
          username: (row.userId && nameById.get(row.userId)) || row.email,
          module: 'autenticación',
          timestamp: row.createdAt,
        });
      }
    }

    const complaintRows = await db
      .select({
        log: complaintAuditLog,
        correlativeNumber: complaints.correlativeNumber,
      })
      .from(complaintAuditLog)
      .innerJoin(complaints, eq(complaintAuditLog.complaintId, complaints.id))
      .where(and(
        eq(complaints.businessId, businessId),
        gte(complaintAuditLog.createdAt, since)
      ))
      .orderBy(desc(complaintAuditLog.createdAt))
      .limit(100);

    for (const row of complaintRows) {
      entries.push({
        id: row.log.id,
        action: row.log.action,
        description: `${row.log.action} · Reclamación ${row.correlativeNumber}`,
        username: (row.log.userId && nameById.get(row.log.userId)) || 'Sistema',
        module: 'reclamaciones',
        timestamp: row.log.createdAt,
      });
    }

    let result = entries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (filters.filterType && filters.filterType !== 'all') {
      result = result.filter(entry =>
        entry.module === filters.filterType || entry.action.includes(filters.filterType as string)
      );
    }

    if (filters.searchTerm) {
      const term = filters.searchTerm.toLowerCase();
      result = result.filter(entry =>
        entry.description.toLowerCase().includes(term) || entry.username.toLowerCase().includes(term)
      );
    }

    return result.slice(0, 200);
  },

  async getAuditLogs(businessId: string, filters: HistoryFilters): Promise<AuditLogEntry[]> {
    const dateRange = filters.dateRange && filters.dateRange > 0 ? filters.dateRange : 30;
    const since = new Date(Date.now() - dateRange * 24 * 60 * 60 * 1000);

    const rows = await db
      .select({
        log: complaintAuditLog,
        correlativeNumber: complaints.correlativeNumber,
        userFirstName: users.firstName,
        userLastName: users.lastName,
        userEmail: users.email,
      })
      .from(complaintAuditLog)
      .innerJoin(complaints, eq(complaintAuditLog.complaintId, complaints.id))
      .leftJoin(users, eq(complaintAuditLog.userId, users.id))
      .where(and(
        eq(complaints.businessId, businessId),
        gte(complaintAuditLog.createdAt, since)
      ))
      .orderBy(desc(complaintAuditLog.createdAt))
      .limit(200);

    return rows.map(row => ({
      id: row.log.id,
      action: row.log.action,
      username: `${row.userFirstName ?? ''} ${row.userLastName ?? ''}`.trim() || row.userEmail || 'Sistema',
      recordId: row.correlativeNumber,
      entityType: 'reclamación',
      oldValues: row.log.oldValues,
      newValues: row.log.newValues,
      timestamp: row.log.createdAt,
    }));
  },

  async getSystemChanges(businessId: string, filters: HistoryFilters): Promise<SystemChange[]> {
    // Instead of a hardcoded changelog this derives the entries from the real
    // records registered for the business: company, libro configuration,
    // branches, books and users.
    const dateRange = filters.dateRange && filters.dateRange > 0 ? filters.dateRange : 30;
    const since = new Date(Date.now() - dateRange * 24 * 60 * 60 * 1000);

    const changes: SystemChange[] = [];
    const push = (
      id: string,
      title: string,
      description: string,
      type: string,
      timestamp: Date | null | undefined,
    ) => {
      if (timestamp && timestamp >= since) {
        changes.push({ id, title, description, type, version: APP_VERSION, timestamp });
      }
    };

    const [business] = await db.select().from(businesses).where(eq(businesses.id, businessId));
    if (business) {
      push(
        'sys-business',
        'Empresa registrada',
        `${business.businessName} (RUC ${business.ruc}) fue dada de alta en la plataforma.`,
        'registro',
        business.createdAt,
      );
    }

    const config = await libroStorage.getLibroConfiguration(businessId);
    if (config) {
      push(
        'sys-libro-config',
        'Libro de Reclamaciones configurado',
        `Se habilitó el libro "${config.libroName}" en librovirtual.pe/${config.urlSlug}.`,
        'configuración',
        config.createdAt,
      );
    }

    const establishmentRows = await db
      .select()
      .from(establishments)
      .where(eq(establishments.businessId, businessId));
    const establishmentNames = new Map<string, string>(
      establishmentRows.map((row): [string, string] => [row.id, row.name]),
    );

    for (const establishment of establishmentRows) {
      push(
        `sys-establishment-${establishment.id}`,
        'Sucursal registrada',
        `${establishment.name} — ${establishment.address}`,
        'sucursal',
        establishment.createdAt,
      );
    }

    const bookRows = await db.select().from(books).where(eq(books.businessId, businessId));
    for (const book of bookRows) {
      push(
        `sys-book-${book.id}`,
        'Libro creado',
        `Libro de ${book.bookType} habilitado para ${establishmentNames.get(book.establishmentId) ?? 'el establecimiento principal'}.`,
        'libro',
        book.createdAt,
      );
    }

    const userRows = await db.select().from(users).where(eq(users.businessId, businessId));
    for (const user of userRows) {
      push(
        `sys-user-${user.id}`,
        'Usuario incorporado',
        `${user.firstName} ${user.lastName} (${user.email}) con rol ${user.role}.`,
        'usuario',
        user.createdAt,
      );
    }

    if (business) {
      push(
        'sys-platform',
        'Plataforma LibroVirtual.pe',
        'Servicio del Libro de Reclamaciones (DS 011-2011-PCM) con respuestas en 15 días hábiles (DS 101-2022-PCM).',
        'plataforma',
        business.createdAt,
      );
    }

    return changes.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  },
};

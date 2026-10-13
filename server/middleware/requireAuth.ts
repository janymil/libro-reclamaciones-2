import { authService } from "../services/authService";

/**
 * Resolves the session user onto `req.user` and rejects anonymous requests.
 *
 * Demo accounts are shared publicly, so they may read and create but never
 * modify or delete existing records.
 */
export const requireAuth = async (req: any, res: any, next: any) => {
  if (!req.session.userId) {
    return res.status(401).json({ message: "No autenticado" });
  }

  try {
    const user = await authService.validateSessionUser(req.session.userId);
    if (!user) {
      req.session.destroy(() => {});
      return res.status(401).json({ message: "Sesión inválida" });
    }

    // Demo accounts are shared publicly: reading and creating is allowed,
    // but existing records cannot be modified or deleted.
    if (user.isDemo && ['PATCH', 'PUT', 'DELETE'].includes(req.method)) {
      return res.status(403).json({
        message: "Cuenta de demostración: no puede modificar ni eliminar registros.",
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({ message: "Error de autenticación" });
  }
};

/**
 * Blocks an endpoint for the shared, publicly known demo account even when the
 * request is a POST.
 *
 * The demo password is public, so settings-level actions (changing the plan,
 * minting API keys/webhooks, creating tenants or logins) must not be reachable
 * from it - otherwise any visitor could hijack the shared demo tenant.
 * Creating complaints stays allowed, which is what the demo is for.
 */
export const requireNonDemo = (req: any, res: any, next: any) => {
  if (req.user?.isDemo) {
    return res.status(403).json({
      message: "Cuenta de demostración: esta configuración no está disponible en el entorno de prueba.",
    });
  }
  next();
};

/**
 * Role-based access control (deny by default).
 *
 * The role is ALWAYS taken from the authenticated session user resolved by
 * `requireAuth` - never from the request - and must run after it. Roles:
 *   - admin:  business owner; tenant administration (users, business profile,
 *             plan, integrations, establishments, compliance register).
 *   - user:   staff; day-to-day complaint handling (update complaints,
 *             attachments, books).
 *   - viewer: read-only / legal review; no mutations at all.
 */
export const requireRole = (...roles: string[]) => (req: any, res: any, next: any) => {
  if (!req.user) {
    return res.status(401).json({ message: "No autenticado" });
  }
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ message: "No tiene permisos para realizar esta acción" });
  }
  next();
};

/** Tenant administration: only the business owner role. */
export const requireAdmin = requireRole('admin');

/** Staff operations: everyone except the read-only viewer role. */
export const requireStaff = requireRole('admin', 'user');

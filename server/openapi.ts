/**
 * OpenAPI 3 contract for the public REST API.
 *
 * Served at `GET /api/v1/openapi.json` (no key required) and linked from the
 * in-app documentation at `/integraciones/api`. Keep it in sync with
 * `server/routes/api.routes.ts` - it is the contract customers build against.
 */

const errorResponse = {
  description: 'Error',
  content: {
    'application/json': {
      schema: {
        type: 'object',
        required: ['error', 'message'],
        properties: {
          error: { type: 'string', example: 'invalid_api_key' },
          message: { type: 'string' },
        },
      },
    },
  },
};

const complaintSummary = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    correlativeNumber: { type: 'string', example: '2026-0001' },
    complaintType: { type: 'string', enum: ['reclamo', 'queja'] },
    status: { type: 'string', enum: ['new', 'in_progress', 'responded', 'resolved', 'overdue'] },
    priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'] },
    productServiceName: { type: 'string' },
    establishmentId: { type: 'string', format: 'uuid' },
    submissionDate: { type: 'string', format: 'date-time' },
    dueDate: { type: 'string', format: 'date-time' },
    responseDate: { type: 'string', format: 'date-time', nullable: true },
    isOverdue: { type: 'boolean' },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

const complaintCreate = {
  type: 'object',
  required: [
    'establishmentId',
    'complaintType',
    'consumerFullName',
    'consumerDocumentType',
    'consumerDocumentNumber',
    'consumerAddress',
    'consumerPhone',
    'consumerEmail',
    'productServiceName',
    'complaintDetail',
  ],
  properties: {
    establishmentId: { type: 'string', format: 'uuid' },
    complaintType: { type: 'string', enum: ['reclamo', 'queja'] },
    consumerFullName: { type: 'string' },
    consumerDocumentType: { type: 'string', enum: ['DNI', 'CE', 'Pasaporte'] },
    consumerDocumentNumber: { type: 'string' },
    consumerAddress: { type: 'string' },
    consumerPhone: { type: 'string' },
    consumerEmail: { type: 'string', format: 'email' },
    guardianFullName: { type: 'string' },
    guardianDocumentType: { type: 'string', enum: ['DNI', 'CE', 'Pasaporte'] },
    guardianDocumentNumber: { type: 'string' },
    guardianRelationship: { type: 'string' },
    productServiceName: { type: 'string' },
    productServiceDescription: { type: 'string' },
    purchaseAmount: { type: 'string', example: '149.90' },
    purchaseDate: { type: 'string', format: 'date' },
    receiptNumber: { type: 'string' },
    complaintDetail: { type: 'string' },
    consumerRequest: { type: 'string' },
    responseMethod: { type: 'string', enum: ['email', 'letter'] },
    consentGiven: { type: 'boolean', example: true },
  },
};

const security = [{ ApiKeyBearer: [] }];

const authErrors = {
  '401': errorResponse,
  '402': errorResponse,
};

const pathsA = {
  '/api/v1/establishments': {
    get: {
      tags: ['Establecimientos'],
      summary: 'Lista los locales activos',
      description: 'El `establishmentId` es obligatorio al crear una reclamación.',
      security,
      responses: {
        '200': {
          description: 'Locales activos',
          content: {
            'application/json': {
              schema: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    name: { type: 'string' },
                    address: { type: 'string' },
                    phone: { type: 'string', nullable: true },
                    email: { type: 'string', nullable: true },
                    identificationCode: { type: 'string', nullable: true },
                    isActive: { type: 'boolean' },
                  },
                },
              },
            },
          },
        },
        ...authErrors,
      },
    },
  },
  '/api/v1/complaints': {
    get: {
      tags: ['Reclamaciones'],
      summary: 'Lista reclamaciones (paginado)',
      security,
      parameters: [
        { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 } },
        { name: 'offset', in: 'query', schema: { type: 'integer', minimum: 0, default: 0 } },
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['new', 'in_progress', 'responded', 'resolved', 'overdue'] } },
        { name: 'type', in: 'query', schema: { type: 'string', enum: ['reclamo', 'queja'] } },
        { name: 'priority', in: 'query', schema: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'] } },
        { name: 'establishmentId', in: 'query', schema: { type: 'string', format: 'uuid' } },
        { name: 'dateFrom', in: 'query', schema: { type: 'string', format: 'date-time' } },
        { name: 'dateTo', in: 'query', schema: { type: 'string', format: 'date-time' } },
      ],
      responses: {
        '200': {
          description: 'Lista. El total del filtro viaja en `X-Total-Count`.',
          headers: {
            'X-Total-Count': { schema: { type: 'integer' } },
            'X-Page-Limit': { schema: { type: 'integer' } },
            'X-Page-Offset': { schema: { type: 'integer' } },
          },
          content: {
            'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/ComplaintSummary' } } },
          },
        },
        ...authErrors,
      },
    },
    post: {
      tags: ['Reclamaciones'],
      summary: 'Registra una reclamación',
      description:
        'Mismo flujo legal que el formulario público: correlativo, plazo de 15 días hábiles, ' +
        'constancia PDF, correo al consumidor y webhooks.',
      security,
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ComplaintCreate' } } },
      },
      responses: {
        '201': {
          description: 'Reclamación creada',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  correlativeNumber: { type: 'string' },
                  dueDate: { type: 'string', format: 'date-time' },
                  status: { type: 'string' },
                },
              },
            },
          },
        },
        '400': errorResponse,
        '403': errorResponse,
        '404': errorResponse,
        ...authErrors,
      },
    },
  },
};

const complaintDetail = {
  allOf: [
    { $ref: '#/components/schemas/ComplaintSummary' },
    {
      type: 'object',
      properties: {
        complaintDetail: { type: 'string' },
        consumerRequest: { type: 'string', nullable: true },
        providerResponse: { type: 'string', nullable: true },
        providerActions: { type: 'string', nullable: true },
        responseMethod: { type: 'string', nullable: true },
        consumer: {
          type: 'object',
          properties: {
            fullName: { type: 'string' },
            documentType: { type: 'string' },
            documentNumber: { type: 'string' },
            address: { type: 'string' },
            phone: { type: 'string' },
            email: { type: 'string' },
          },
        },
        attachments: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              originalName: { type: 'string' },
              mimeType: { type: 'string' },
              fileSize: { type: 'integer' },
              uploadedAt: { type: 'string', format: 'date-time' },
              downloadUrl: { type: 'string' },
            },
          },
        },
      },
    },
  ],
};

const pathsB = {
  '/api/v1/complaints/{id}': {
    get: {
      tags: ['Reclamaciones'],
      summary: 'Detalle de una reclamación',
      description: 'Incluye los datos del consumidor y las evidencias. Solo del propio RUC.',
      security,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      responses: {
        '200': {
          description: 'Detalle',
          content: { 'application/json': { schema: complaintDetail } },
        },
        '404': errorResponse,
        ...authErrors,
      },
    },
    patch: {
      tags: ['Reclamaciones'],
      summary: 'Actualiza estado o prioridad',
      security,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                status: { type: 'string', enum: ['new', 'in_progress', 'responded', 'resolved', 'overdue'] },
                priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'] },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Actualizada', content: { 'application/json': { schema: { $ref: '#/components/schemas/ComplaintSummary' } } } },
        '400': errorResponse,
        '404': errorResponse,
        ...authErrors,
      },
    },
  },
  '/api/v1/complaints/{id}/response': {
    post: {
      tags: ['Reclamaciones'],
      summary: 'Registra la respuesta al consumidor',
      description: 'Guarda la respuesta, la envía por correo y marca la reclamación como respondida.',
      security,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['providerResponse'],
              properties: {
                providerResponse: { type: 'string', maxLength: 20000 },
                providerActions: { type: 'string', maxLength: 5000 },
                responseMethod: { type: 'string', enum: ['email', 'letter', 'phone'], default: 'email' },
              },
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Respuesta registrada',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  correlativeNumber: { type: 'string' },
                  status: { type: 'string' },
                  responseDate: { type: 'string', format: 'date-time' },
                  responseMethod: { type: 'string' },
                  emailSent: { type: 'boolean' },
                },
              },
            },
          },
        },
        '400': errorResponse,
        '404': errorResponse,
        ...authErrors,
      },
    },
  },
};

const pathsC = {
  '/api/v1/complaints/{id}/attachments': {
    get: {
      tags: ['Evidencias'],
      summary: 'Lista las evidencias de una reclamación',
      security,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      responses: { '200': { description: 'Evidencias' }, '404': errorResponse, ...authErrors },
    },
    post: {
      tags: ['Evidencias'],
      summary: 'Sube evidencias (multipart/form-data)',
      description: 'Campo `files` (máximo 10). Los archivos se cifran en reposo.',
      security,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              properties: {
                files: { type: 'array', items: { type: 'string', format: 'binary' } },
              },
            },
          },
        },
      },
      responses: {
        '201': { description: 'Archivos subidos' },
        '400': errorResponse,
        '404': errorResponse,
        ...authErrors,
      },
    },
  },
  '/api/v1/attachments/{id}/file': {
    get: {
      tags: ['Evidencias'],
      summary: 'Descarga una evidencia',
      security,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      responses: { '200': { description: 'Archivo' }, '404': errorResponse, '410': errorResponse, ...authErrors },
    },
  },
  '/api/v1/attachments/limits': {
    get: {
      tags: ['Evidencias'],
      summary: 'Límites de subida (tamaño, tipos, cantidad)',
      security,
      responses: { '200': { description: 'Límites' }, ...authErrors },
    },
  },
  '/api/v1/ping': {
    get: {
      tags: ['Sistema'],
      summary: 'Health probe',
      security: [],
      responses: { '200': { description: 'Servicio operativo' } },
    },
  },
  '/api/v1/openapi.json': {
    get: {
      tags: ['Sistema'],
      summary: 'Este documento',
      security: [],
      responses: { '200': { description: 'Especificación OpenAPI' } },
    },
  },
};

export function buildOpenApiDocument(origin: string) {
  return {
    openapi: '3.0.3',
    info: {
      title: 'LibroDigital.pe - API de integraciones',
      version: '1.0.0',
      description:
        'API REST para que un CRM/ERP cree y gestione reclamaciones del Libro de Reclamaciones. ' +
        'Disponible en el plan Empresarial. Autenticación: `Authorization: Bearer ld_...`. ' +
        'El libro sigue siendo de LibroDigital.pe: todos los datos, constancias y plazos legales viven aquí.',
      contact: { name: 'LibroDigital.pe', email: 'hola@librodigital.pe', url: origin },
    },
    servers: [{ url: origin, description: 'Producción' }],
    security,
    tags: [
      { name: 'Reclamaciones' },
      { name: 'Evidencias' },
      { name: 'Establecimientos' },
      { name: 'Sistema' },
    ],
    components: {
      securitySchemes: {
        ApiKeyBearer: {
          type: 'http',
          scheme: 'bearer',
          description: 'Clave creada en Integraciones → Claves de API. Se muestra una sola vez.',
        },
      },
      schemas: {
        ComplaintSummary: complaintSummary,
        ComplaintCreate: complaintCreate,
      },
    },
    paths: { ...pathsA, ...pathsB, ...pathsC },
  };
}

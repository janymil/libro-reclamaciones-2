import { useState } from 'react';
import { Link } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Establishment, LibroConfiguration } from '@shared/schema';
import type { BookSummary } from '@/lib/api-types';
import { downloadBlob, todayStamp } from '@/lib/export';
import { apiRequest } from '@/lib/queryClient';
import AppLayout from '@/components/layout/app-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, BookOpen, Download, FileText, ExternalLink, Link2, AlertCircle, Save, QrCode } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { z } from 'zod';

const createBookSchema = z.object({
  establishmentId: z.string().min(1, 'Seleccione un establecimiento'),
  bookType: z.enum(['reclamos', 'sugerencias', 'otros']),
  description: z.string().optional(),
});

type CreateBook = z.infer<typeof createBookSchema>;

export default function Books() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [manageTarget, setManageTarget] = useState<BookSummary | null>(null);
  const [manageDescription, setManageDescription] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: books, isLoading } = useQuery<BookSummary[]>({
    queryKey: ['/api/books'],
  });

  const { data: establishments } = useQuery<Establishment[]>({
    queryKey: ['/api/establishments'],
  });

  // The public side of the book: ONE per company (libro_configuration).
  const { data: libroConfig } = useQuery<LibroConfiguration | null>({
    queryKey: ['/api/libro-configuration'],
  });

  const form = useForm<CreateBook>({
    resolver: zodResolver(createBookSchema),
    defaultValues: {
      establishmentId: '',
      bookType: 'reclamos',
      description: '',
    },
  });

  const createBookMutation = useMutation({
    mutationFn: async (data: CreateBook) => {
      return apiRequest('POST', '/api/books', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/books'] });
      toast({
        title: "Libro creado",
        description: "El libro de reclamaciones se ha creado exitosamente.",
      });
      setIsDialogOpen(false);
      form.reset();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo crear el libro. Intente nuevamente.",
        variant: "destructive",
      });
    },
  });

  const downloadBookMutation = useMutation({
    mutationFn: async (bookId: string) => {
      const response = await fetch(`/api/books/${bookId}/download`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('No se pudo generar el PDF del libro');
      }

      const blob = await response.blob();
      downloadBlob(`libro-de-reclamaciones-${todayStamp()}.pdf`, blob);
    },
    onSuccess: () => {
      toast({
        title: "Libro descargado",
        description: "El PDF con los registros del libro se ha descargado.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo generar el PDF del libro. Intente nuevamente.",
        variant: "destructive",
      });
    },
  });

  const updateBookMutation = useMutation({
    mutationFn: async () => {
      if (!manageTarget) return null;
      const response = await apiRequest('PATCH', `/api/books/${manageTarget.id}`, {
        description: manageDescription.trim() || null,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/books'] });
      toast({
        title: "Registro actualizado",
        description: "Los cambios se guardaron correctamente.",
      });
      setManageTarget(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo actualizar el registro. Intente nuevamente.",
        variant: "destructive",
      });
    },
  });

  const openManage = (book: BookSummary) => {
    setManageTarget(book);
    setManageDescription(book.description ?? '');
  };

  const saveManage = () => updateBookMutation.mutate();

  const onSubmit = (data: CreateBook) => {
    createBookMutation.mutate(data);
  };

  /**
   * Creates the missing register of a local, from the table row itself: the repair
   * path for a sucursal that predates the automatic register (its complaints are
   * being received, but they cannot be exported per local until this exists).
   */
  const createRegisterFor = (establishmentId: string) => {
    createBookMutation.mutate({ establishmentId, bookType: 'reclamos', description: '' });
  };

  const getBookTypeLabel = (type: string) => {
    switch (type) {
      case 'reclamos': return 'Libro de Reclamaciones';
      case 'sugerencias': return 'Libro de Sugerencias';
      case 'otros': return 'Otros Registros';
      default: return type;
    }
  };

  const getBookTypeColor = (type: string) => {
    switch (type) {
      case 'reclamos': return 'bg-red-100 text-red-800';
      case 'sugerencias': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const registers = books ?? [];
  const locals = establishments ?? [];

  /**
   * One row per (local, register), regrouped by the customer's own mental model:
   * ONE Libro de Reclamaciones for the company, and a register per local inside it.
   * A local whose register is missing shows a "create" action instead of an empty
   * card, because that is exactly the legacy shape that made the page look broken.
   */
  const rows: Array<{ key: string; local: Establishment; book?: BookSummary }> = locals.flatMap((local) => {
    const localRegisters = registers
      .filter((book) => book.establishmentId === local.id)
      .sort((a, b) => (a.bookType === 'reclamos' ? -1 : b.bookType === 'reclamos' ? 1 : 0));

    if (localRegisters.length === 0) {
      return [{ key: `${local.id}-none`, local }];
    }

    return localRegisters.map((book) => ({ key: book.id, local, book }));
  });

  const totalRecords = registers.reduce((sum, book) => sum + (book.entriesCount || 0), 0);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900" data-testid="books-title">
              Libro de Reclamaciones
            </h1>
            <p className="text-gray-600">
              Uno para toda tu empresa: tus clientes entran por el mismo enlace y eligen el local.
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="flex items-center gap-2" data-testid="button-create-book">
                <Plus className="h-4 w-4" />
                Agregar registro
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Agregar registro</DialogTitle>
                <DialogDescription>
                  Cada local recibe su registro de Reclamos automáticamente. Usa esto para un libro
                  de sugerencias u otro registro, o para reponer el registro de un local.
                </DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="establishmentId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Establecimiento</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-establishment">
                              <SelectValue placeholder="Seleccionar establecimiento" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {establishments?.map((establishment: any) => (
                              <SelectItem key={establishment.id} value={establishment.id}>
                                {establishment.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="bookType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tipo de Libro</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-book-type">
                              <SelectValue placeholder="Seleccionar tipo" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="reclamos">Libro de Reclamaciones</SelectItem>
                            <SelectItem value="sugerencias">Libro de Sugerencias</SelectItem>
                            <SelectItem value="otros">Otros Registros</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Descripción (Opcional)</FormLabel>
                        <FormControl>
                          <Input placeholder="Descripción del libro" {...field} data-testid="input-book-description" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex justify-end space-x-2 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsDialogOpen(false)}
                      data-testid="button-cancel"
                    >
                      Cancelar
                    </Button>
                    <Button 
                      type="submit" 
                      disabled={createBookMutation.isPending}
                      data-testid="button-save-book"
                    >
                      {createBookMutation.isPending ? 'Creando...' : 'Crear Libro'}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        {/* The public book: ONE per company. The registers below are the internal
            side (one PDF per local, for an inspection). */}
        <Card data-testid="public-book">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              {libroConfig?.libroName || 'Tu Libro de Reclamaciones'}
            </CardTitle>
            <CardDescription>
              Un solo enlace y un solo QR para toda la empresa: tus clientes eligen el local al
              reclamar, y los folios (2026-0001…) son únicos para la empresa.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
              <span className="flex items-center gap-2 font-medium text-gray-900">
                <Link2 className="h-4 w-4 text-gray-500" aria-hidden="true" />
                {libroConfig?.urlSlug ? `librodigital.pe/${libroConfig.urlSlug}` : 'Enlace no configurado'}
              </span>
              {libroConfig?.urlSlug && (
                <a
                  href={`/libro/${libroConfig.urlSlug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-blue-700 hover:underline"
                >
                  Abrir libro público
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
              <span className="flex items-center gap-2">
                <FileText className="h-4 w-4" aria-hidden="true" />
                {totalRecords} {totalRecords === 1 ? 'reclamo recibido' : 'reclamos recibidos'} en toda
                la empresa
              </span>
              <span className="flex items-center gap-2">
                {locals.length} {locals.length === 1 ? 'local' : 'locales'} con su propio registro
              </span>
            </div>

            <Button asChild variant="outline" size="sm" data-testid="button-public-book-qr">
              <Link href="/codigo-qr">
                <QrCode className="mr-2 h-4 w-4" />
                Ver enlace, QR y aviso para imprimir
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Per-local registers */}
        <Card>
          <CardHeader>
            <CardTitle>Registros por local</CardTitle>
            <CardDescription>
              Cada local tiene su propio registro para que puedas mostrar o exportar sus reclamos por
              separado (fiscalización por establecimiento, DS 011-2011-PCM).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="py-6 text-sm text-gray-500">Cargando registros…</p>
            ) : rows.length === 0 ? (
              <div className="py-8 text-center">
                <BookOpen className="mx-auto mb-3 h-10 w-10 text-gray-400" aria-hidden="true" />
                <h3 className="mb-1 text-lg font-medium text-gray-900">Aún no tienes locales</h3>
                <p className="mb-4 text-gray-600">
                  Registra tu primer local y recibirá su registro de Reclamos automáticamente.
                </p>
                <Button asChild data-testid="button-first-local">
                  <Link href="/sucursales">Ir a Sucursales</Link>
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table data-testid="registers-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Local</TableHead>
                      <TableHead>Registro</TableHead>
                      <TableHead>Reclamos</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map(({ key, local, book }) => (
                      <TableRow key={key} data-testid={`register-row-${key}`}>
                        <TableCell>
                          <div className="font-medium text-gray-900">{local.name}</div>
                          <div className="flex items-center gap-2">
                            <code className="text-xs text-gray-500">{local.identificationCode}</code>
                            {!local.isActive && (
                              <Badge variant="outline" className="text-xs text-gray-500">
                                Local inactivo
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {book ? (
                            <div className="flex flex-col gap-1">
                              <Badge className={getBookTypeColor(book.bookType)}>
                                {getBookTypeLabel(book.bookType)}
                              </Badge>
                              {book.description && (
                                <span className="text-xs text-gray-500">{book.description}</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-sm text-amber-700">Sin registro todavía</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-gray-700">
                          {book ? `${book.entriesCount || 0}` : '—'}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap justify-end gap-2">
                            {book ? (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => downloadBookMutation.mutate(book.id)}
                                  disabled={downloadBookMutation.isPending}
                                  data-testid={`button-download-${book.id}`}
                                >
                                  <Download className="mr-2 h-4 w-4" />
                                  PDF
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openManage(book)}
                                  data-testid={`button-manage-${book.id}`}
                                >
                                  Gestionar
                                </Button>
                              </>
                            ) : (
                              <Button
                                size="sm"
                                onClick={() => createRegisterFor(local.id)}
                                disabled={createBookMutation.isPending}
                                data-testid={`button-create-register-${local.id}`}
                              >
                                <Plus className="mr-2 h-4 w-4" />
                                Crear registro
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Legal Requirements Alert */}
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-800">
              <AlertCircle className="h-5 w-5" />
              Requisitos Legales
            </CardTitle>
          </CardHeader>
          <CardContent className="text-orange-700">
            <p className="text-sm">
              Según el DS 011-2011-PCM, todos los establecimientos deben contar con un Libro de Reclamaciones 
              físico o virtual. Los registros deben conservarse por un mínimo de 2 años y estar disponibles 
              para inspección de las autoridades competentes.
            </p>
          </CardContent>
        </Card>
        {/* Gestionar registro */}
        <Dialog open={!!manageTarget} onOpenChange={(open) => !open && setManageTarget(null)}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Gestionar {manageTarget ? getBookTypeLabel(manageTarget.bookType) : 'registro'}
              </DialogTitle>
              <DialogDescription>
                {manageTarget?.establishmentName} · {manageTarget?.entriesCount || 0} registros
              </DialogDescription>
            </DialogHeader>

            {manageTarget && (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="manage-book-description">Descripción interna</Label>
                  <Input
                    id="manage-book-description"
                    value={manageDescription}
                    onChange={(e) => setManageDescription(e.target.value)}
                    placeholder="Ej.: libro de la caja 1, local de verano…"
                    data-testid="input-manage-book-description"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Solo para tu equipo: no se muestra en el libro público.
                  </p>
                </div>

                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
                  <p>
                    El enlace, el QR y los folios son de toda la empresa: este registro separa
                    únicamente los reclamos de <strong>{manageTarget.establishmentName}</strong> para
                    que puedas exportarlos o imprimirlos.
                  </p>
                  <p className="mt-2">
                    Para dejar de recibir reclamos en este local, desactívalo en{' '}
                    <Link href="/sucursales" className="text-blue-700 hover:underline">
                      Sucursales
                    </Link>
                    .
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => downloadBookMutation.mutate(manageTarget.id)}
                    disabled={downloadBookMutation.isPending}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Descargar PDF
                  </Button>
                  <Button
                    className="btn-primary"
                    onClick={saveManage}
                    disabled={updateBookMutation.isPending}
                    data-testid="button-save-book"
                  >
                    <Save className="h-4 w-4 mr-1" />
                    {updateBookMutation.isPending ? 'Guardando...' : 'Guardar cambios'}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>


      </div>
    </AppLayout>
  );
}
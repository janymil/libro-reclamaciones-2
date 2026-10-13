import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Establishment } from '@shared/schema';
import type { BookSummary } from '@/lib/api-types';
import { downloadBlob, todayStamp } from '@/lib/export';
import { apiRequest } from '@/lib/queryClient';
import AppLayout from '@/components/layout/app-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, BookOpen, Download, FileText, Calendar, AlertCircle, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import LibroQrCard from '@/components/libro/libro-qr-card';
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
  const [manageActive, setManageActive] = useState(true);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: books, isLoading } = useQuery<BookSummary[]>({
    queryKey: ['/api/books'],
  });

  const { data: establishments } = useQuery<Establishment[]>({
    queryKey: ['/api/establishments'],
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
    onError: (error) => {
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
        isActive: manageActive,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/books'] });
      toast({
        title: "Libro actualizado",
        description: "Los cambios se guardaron correctamente.",
      });
      setManageTarget(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo actualizar el libro. Intente nuevamente.",
        variant: "destructive",
      });
    },
  });

  const openManage = (book: BookSummary) => {
    setManageTarget(book);
    setManageDescription(book.description ?? '');
    setManageActive(book.isActive);
  };

  const saveManage = () => updateBookMutation.mutate();

  const onSubmit = (data: CreateBook) => {
    createBookMutation.mutate(data);
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
      case 'otros': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900" data-testid="books-title">
              Gestión de Libros
            </h1>
            <p className="text-gray-600">
              Administra los libros de reclamaciones y registros oficiales
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="flex items-center gap-2" data-testid="button-create-book">
                <Plus className="h-4 w-4" />
                Crear Nuevo Libro
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Crear Nuevo Libro</DialogTitle>
                <DialogDescription>
                  Configure un nuevo libro oficial para su establecimiento.
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

        {/* Books Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader>
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="h-3 bg-gray-200 rounded"></div>
                    <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : books?.length ? (
            books.map((book: any) => (
              <Card key={book.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2" data-testid={`book-title-${book.id}`}>
                        <BookOpen className="h-5 w-5" />
                        {getBookTypeLabel(book.bookType)}
                      </CardTitle>
                      <CardDescription>{book.establishmentName}</CardDescription>
                    </div>
                    <Badge className={getBookTypeColor(book.bookType)} data-testid={`book-type-${book.id}`}>
                      {book.bookType}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Calendar className="h-4 w-4" />
                    <span>Creado: {new Date(book.createdAt).toLocaleDateString('es-PE')}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <FileText className="h-4 w-4" />
                    <span>{book.entriesCount || 0} registros</span>
                  </div>
                  {book.description && (
                    <p className="text-sm text-gray-600">{book.description}</p>
                  )}
                  <div className="flex justify-between items-center pt-2">
                    <span className={`text-sm font-medium ${
                      book.isActive ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {book.isActive ? 'Activo' : 'Inactivo'}
                    </span>
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => downloadBookMutation.mutate(book.id)}
                        disabled={downloadBookMutation.isPending}
                        data-testid={`button-download-${book.id}`}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openManage(book)}
                        data-testid={`button-manage-${book.id}`}
                      >
                        Gestionar
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <div className="col-span-full text-center py-12">
              <BookOpen className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No hay libros creados</h3>
              <p className="text-gray-600 mb-4">
                Cree su primer libro de reclamaciones para cumplir con la normativa legal.
              </p>
              <Button onClick={() => setIsDialogOpen(true)} data-testid="button-create-first-book">
                <Plus className="h-4 w-4 mr-2" />
                Crear Primer Libro
              </Button>
            </div>
          )}
        </div>
        {/* Gestionar libro */}
        <Dialog open={!!manageTarget} onOpenChange={(open) => !open && setManageTarget(null)}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Gestionar {manageTarget ? getBookTypeLabel(manageTarget.bookType) : 'libro'}
              </DialogTitle>
              <DialogDescription>
                {manageTarget?.establishmentName} · {manageTarget?.entriesCount || 0} registros
              </DialogDescription>
            </DialogHeader>

            {manageTarget && (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="manage-book-description">Descripción</Label>
                  <Input
                    id="manage-book-description"
                    value={manageDescription}
                    onChange={(e) => setManageDescription(e.target.value)}
                    placeholder="Descripción interna del libro"
                    data-testid="input-manage-book-description"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    id="manage-book-active"
                    type="checkbox"
                    className="h-4 w-4"
                    checked={manageActive}
                    onChange={(e) => setManageActive(e.target.checked)}
                  />
                  <Label htmlFor="manage-book-active">Libro activo</Label>
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

                {/* Código QR del libro virtual público */}
                <LibroQrCard />
              </div>
            )}
          </DialogContent>
        </Dialog>


      </div>
    </AppLayout>
  );
}
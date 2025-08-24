import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import EstablishmentForm from "./establishment-form";
import type { Establishment } from "@shared/schema";

export default function EstablishmentList() {
  const [selectedEstablishment, setSelectedEstablishment] = useState<Establishment | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const { data: establishments = [], isLoading, error } = useQuery({
    queryKey: ['/api/establishments'],
    queryFn: async () => {
      const response = await fetch('/api/establishments', {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to fetch establishments');
      }
      return response.json() as Promise<Establishment[]>;
    },
  });

  const handleEditEstablishment = (establishment: Establishment) => {
    setSelectedEstablishment(establishment);
    setIsFormOpen(true);
  };

  const handleNewEstablishment = () => {
    setSelectedEstablishment(null);
    setIsFormOpen(true);
  };

  const handleFormSuccess = () => {
    setIsFormOpen(false);
    setSelectedEstablishment(null);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 bg-gray-200 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-red-600">
            <span className="material-icons text-4xl mb-2">error</span>
            <p>Error al cargar los establecimientos</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6" data-testid="establishment-list">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Establecimientos</CardTitle>
              <p className="text-sm text-gray-600 mt-1">
                Gestione los locales donde debe implementar el Libro de Reclamaciones
              </p>
            </div>
            <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
              <DialogTrigger asChild>
                <Button 
                  className="btn-primary"
                  onClick={handleNewEstablishment}
                  data-testid="button-new-establishment"
                >
                  <span className="material-icons mr-2">add</span>
                  Nuevo Establecimiento
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>
                    {selectedEstablishment ? 'Editar Establecimiento' : 'Nuevo Establecimiento'}
                  </DialogTitle>
                </DialogHeader>
                <EstablishmentForm
                  establishment={selectedEstablishment || undefined}
                  onSuccess={handleFormSuccess}
                  onCancel={() => setIsFormOpen(false)}
                />
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>

        <CardContent>
          {establishments.length === 0 ? (
            <div className="text-center py-8">
              <span className="material-icons text-4xl text-gray-400 mb-2">business</span>
              <p className="text-gray-600 mb-4">No hay establecimientos registrados</p>
              <Button 
                className="btn-primary"
                onClick={handleNewEstablishment}
                data-testid="button-add-first-establishment"
              >
                Agregar Primer Establecimiento
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Dirección</TableHead>
                    <TableHead>Contacto</TableHead>
                    <TableHead>Código ID</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {establishments.map((establishment) => (
                    <TableRow key={establishment.id} data-testid={`establishment-row-${establishment.id}`}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{establishment.name}</div>
                          <div className="text-sm text-gray-500">
                            Creado: {new Date(establishment.createdAt).toLocaleDateString('es-PE')}
                          </div>
                        </div>
                      </TableCell>
                      
                      <TableCell>
                        <div className="max-w-xs">
                          <p className="text-sm">{establishment.address}</p>
                        </div>
                      </TableCell>
                      
                      <TableCell>
                        <div className="text-sm">
                          {establishment.phone && (
                            <div>📞 {establishment.phone}</div>
                          )}
                          {establishment.email && (
                            <div>✉️ {establishment.email}</div>
                          )}
                          {!establishment.phone && !establishment.email && (
                            <span className="text-gray-400">No especificado</span>
                          )}
                        </div>
                      </TableCell>
                      
                      <TableCell>
                        <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                          {establishment.identificationCode}
                        </code>
                      </TableCell>
                      
                      <TableCell>
                        <Badge className={establishment.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                          {establishment.isActive ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </TableCell>
                      
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditEstablishment(establishment)}
                            data-testid={`button-edit-${establishment.id}`}
                          >
                            <span className="material-icons text-sm">edit</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            data-testid={`button-generate-notice-${establishment.id}`}
                          >
                            <span className="material-icons text-sm">download</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            data-testid={`button-view-complaints-${establishment.id}`}
                          >
                            <span className="material-icons text-sm">assignment</span>
                          </Button>
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

      {/* Legal Information */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="pt-6">
          <div className="flex items-start space-x-3">
            <span className="material-icons text-blue-600 mt-1">info</span>
            <div>
              <h4 className="font-medium text-blue-800 mb-2">Requisitos Legales</h4>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• Cada establecimiento debe tener un Libro de Reclamaciones (DS 011-2011-PCM)</li>
                <li>• El código de identificación permite consolidar registros a nivel nacional</li>
                <li>• Debe exhibir el aviso del Libro en lugar visible y accesible</li>
                <li>• Conservar hojas de reclamación por 2 años desde el registro</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

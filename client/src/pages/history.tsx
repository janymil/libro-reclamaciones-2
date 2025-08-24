import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import AppLayout from '@/components/layout/app-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, Clock, User, FileText, Filter, Search, Download, Eye } from 'lucide-react';

export default function History() {
  const [filterType, setFilterType] = useState('all');
  const [dateRange, setDateRange] = useState('30');
  const [searchTerm, setSearchTerm] = useState('');

  const { data: activityHistory, isLoading } = useQuery({
    queryKey: ['/api/history/activity', filterType, dateRange, searchTerm],
  });

  const { data: auditLogs } = useQuery({
    queryKey: ['/api/history/audit', filterType, dateRange],
  });

  const { data: systemChanges } = useQuery({
    queryKey: ['/api/history/system-changes', dateRange],
  });

  const getActionIcon = (action: string) => {
    switch (action.toLowerCase()) {
      case 'create': return <FileText className="h-4 w-4 text-green-600" />;
      case 'update': return <Eye className="h-4 w-4 text-blue-600" />;
      case 'delete': return <FileText className="h-4 w-4 text-red-600" />;
      case 'login': return <User className="h-4 w-4 text-purple-600" />;
      default: return <FileText className="h-4 w-4 text-gray-600" />;
    }
  };

  const getActionColor = (action: string) => {
    switch (action.toLowerCase()) {
      case 'create': return 'bg-green-100 text-green-800';
      case 'update': return 'bg-blue-100 text-blue-800';
      case 'delete': return 'bg-red-100 text-red-800';
      case 'login': return 'bg-purple-100 text-purple-800';
      case 'export': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatRelativeTime = (date: string) => {
    const now = new Date();
    const past = new Date(date);
    const diffInHours = Math.floor((now.getTime() - past.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 1) return 'Hace menos de 1 hora';
    if (diffInHours < 24) return `Hace ${diffInHours} hora${diffInHours !== 1 ? 's' : ''}`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 30) return `Hace ${diffInDays} día${diffInDays !== 1 ? 's' : ''}`;
    
    return past.toLocaleDateString('es-PE');
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900" data-testid="history-title">
              Historial del Sistema
            </h1>
            <p className="text-gray-600">
              Registro detallado de actividades, cambios y eventos del sistema
            </p>
          </div>
          <Button className="flex items-center gap-2" data-testid="button-export-history">
            <Download className="h-4 w-4" />
            Exportar Historial
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filtros
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label htmlFor="search">Buscar</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="search"
                    placeholder="Buscar en historial..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                    data-testid="input-search-history"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="filter-type">Tipo de Actividad</Label>
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger data-testid="select-filter-type">
                    <SelectValue placeholder="Todos los tipos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los tipos</SelectItem>
                    <SelectItem value="complaints">Reclamaciones</SelectItem>
                    <SelectItem value="users">Usuarios</SelectItem>
                    <SelectItem value="businesses">Empresas</SelectItem>
                    <SelectItem value="system">Sistema</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="date-range">Período</Label>
                <Select value={dateRange} onValueChange={setDateRange}>
                  <SelectTrigger data-testid="select-date-range">
                    <SelectValue placeholder="Último mes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">Últimos 7 días</SelectItem>
                    <SelectItem value="30">Últimos 30 días</SelectItem>
                    <SelectItem value="90">Últimos 3 meses</SelectItem>
                    <SelectItem value="365">Último año</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button variant="outline" className="w-full" data-testid="button-clear-filters">
                  Limpiar Filtros
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="activity" className="space-y-4">
          <TabsList>
            <TabsTrigger value="activity" data-testid="tab-activity">Actividad de Usuarios</TabsTrigger>
            <TabsTrigger value="audit" data-testid="tab-audit">Auditoría de Datos</TabsTrigger>
            <TabsTrigger value="system" data-testid="tab-system">Cambios del Sistema</TabsTrigger>
          </TabsList>

          <TabsContent value="activity" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Actividad de Usuarios</CardTitle>
                <CardDescription>
                  Registro de acciones realizadas por usuarios del sistema
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="flex items-center space-x-4 p-4 border rounded-lg animate-pulse">
                        <div className="h-10 w-10 bg-gray-200 rounded"></div>
                        <div className="flex-1 space-y-2">
                          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                          <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                        </div>
                        <div className="h-6 bg-gray-200 rounded w-20"></div>
                      </div>
                    ))}
                  </div>
                ) : activityHistory?.length ? (
                  <div className="space-y-4">
                    {activityHistory.map((activity: any) => (
                      <div key={activity.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
                        <div className="flex items-center space-x-4">
                          <div className="p-2 rounded-lg bg-gray-100">
                            {getActionIcon(activity.action)}
                          </div>
                          <div>
                            <h4 className="font-medium" data-testid={`activity-title-${activity.id}`}>
                              {activity.description}
                            </h4>
                            <div className="flex items-center gap-4 text-sm text-gray-600">
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {activity.username}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatRelativeTime(activity.createdAt)}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Badge className={getActionColor(activity.action)} data-testid={`activity-action-${activity.id}`}>
                            {activity.action}
                          </Badge>
                          <Button variant="outline" size="sm" data-testid={`button-view-${activity.id}`}>
                            Ver Detalles
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No hay actividad registrada</h3>
                    <p className="text-gray-600">No se encontró actividad para los filtros seleccionados.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="audit" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Auditoría de Datos</CardTitle>
                <CardDescription>
                  Registro de cambios en datos críticos del sistema
                </CardDescription>
              </CardHeader>
              <CardContent>
                {auditLogs?.length ? (
                  <div className="space-y-4">
                    {auditLogs.map((log: any) => (
                      <div key={log.id} className="p-4 border rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-medium" data-testid={`audit-title-${log.id}`}>
                            {log.tableName} - {log.operation}
                          </h4>
                          <span className="text-sm text-gray-500">
                            {new Date(log.timestamp).toLocaleString('es-PE')}
                          </span>
                        </div>
                        <div className="text-sm text-gray-600">
                          <p><strong>Usuario:</strong> {log.username}</p>
                          <p><strong>Registro ID:</strong> {log.recordId}</p>
                          {log.oldValues && (
                            <details className="mt-2">
                              <summary className="cursor-pointer">Ver cambios detallados</summary>
                              <div className="mt-2 p-2 bg-gray-50 rounded text-xs">
                                <p><strong>Valores anteriores:</strong></p>
                                <pre>{JSON.stringify(log.oldValues, null, 2)}</pre>
                                <p className="mt-2"><strong>Valores nuevos:</strong></p>
                                <pre>{JSON.stringify(log.newValues, null, 2)}</pre>
                              </div>
                            </details>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No hay registros de auditoría</h3>
                    <p className="text-gray-600">No se encontraron cambios en los datos para el período seleccionado.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="system" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Cambios del Sistema</CardTitle>
                <CardDescription>
                  Actualizaciones, mantenimiento y eventos del sistema
                </CardDescription>
              </CardHeader>
              <CardContent>
                {systemChanges?.length ? (
                  <div className="space-y-4">
                    {systemChanges.map((change: any) => (
                      <div key={change.id} className="p-4 border rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-medium" data-testid={`system-change-${change.id}`}>
                            {change.title}
                          </h4>
                          <Badge variant="outline">{change.type}</Badge>
                        </div>
                        <p className="text-sm text-gray-600 mb-2">{change.description}</p>
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(change.timestamp).toLocaleString('es-PE')}
                          </span>
                          <span>Versión: {change.version}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No hay cambios del sistema</h3>
                    <p className="text-gray-600">No se registraron cambios del sistema en el período seleccionado.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
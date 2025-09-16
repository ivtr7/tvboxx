import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Monitor, Wifi, WifiOff, AlertTriangle, Edit, Trash2, Power } from 'lucide-react';
import LoadingSpinner from '../../components/LoadingSpinner';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import { validateForm, VALIDATION_SCHEMAS, ValidationResult } from '../../utils/validation';
import FormInput from '../../components/admin/FormInput';
import ConfirmDialog from '../../components/admin/ConfirmDialog';

interface Device {
  id: string;
  nome: string;
  localizacao: string;
  status: 'online' | 'offline' | 'erro';
  ultima_atividade: string;
  created_at: string;
}

const DevicesPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deviceToDelete, setDeviceToDelete] = useState<Device | null>(null);
  const [deviceContent, setDeviceContent] = useState<any[]>([]);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [newDevice, setNewDevice] = useState({
    nome: '',
    localizacao: '',
    descricao: ''
  });
  const [editDevice, setEditDevice] = useState({
    nome: '',
    localizacao: '',
    descricao: ''
  });

  // Fetch devices from backend API
  const { data: devices, isLoading } = useQuery({
    queryKey: ['devices'],
    queryFn: async () => {
      const response = await api.get('/devices');
      return response.data as Device[];
    }
  });

  // Fetch device content
  const fetchDeviceContent = async (deviceId: string) => {
    try {
      const response = await api.get(`/content/device/${deviceId}`);
      setDeviceContent(response.data);
    } catch (error) {
      console.error('Erro ao buscar conteúdo do dispositivo:', error);
      toast.error('Erro ao carregar conteúdo do dispositivo');
    }
  };

  // Handle device card click
  const handleDeviceClick = async (device: Device) => {
    setSelectedDevice(device);
    await fetchDeviceContent(device.id);
    setShowDetailModal(true);
  };

  const addDeviceMutation = useMutation({
    mutationFn: async (deviceData: typeof newDevice) => {
      const response = await api.post('/devices/register', {
        name: deviceData.nome,
        location: deviceData.localizacao,
        type: 'display'
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      setShowAddModal(false);
      setNewDevice({ nome: '', localizacao: '', descricao: '' });
      toast.success('Dispositivo adicionado com sucesso!');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Erro ao adicionar dispositivo');
    }
  });

  const deleteDeviceMutation = useMutation({
    mutationFn: async (deviceId: string) => {
      await api.delete(`/devices/${deviceId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      toast.success('Dispositivo removido com sucesso!');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Erro ao remover dispositivo');
    }
  });

  const toggleDevicePowerMutation = useMutation({
    mutationFn: async ({ deviceId, action }: { deviceId: string; action: 'restart' | 'shutdown' }) => {
      await api.post(`/devices/${deviceId}/power`, { action });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      toast.success(`Comando ${variables.action === 'restart' ? 'reiniciar' : 'desligar'} enviado!`);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Erro ao enviar comando');
    }
  });

  const updateDeviceMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof editDevice }) => {
      const response = await api.put(`/devices/${id}`, {
        name: data.nome,
        location: data.localizacao
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      setShowEditModal(false);
      setEditingDevice(null);
      setEditDevice({ nome: '', localizacao: '', descricao: '' });
      toast.success('Dispositivo atualizado com sucesso!');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Erro ao atualizar dispositivo');
    }
  });

  const handleAddDevice = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form
    const validation: ValidationResult = validateForm(newDevice, VALIDATION_SCHEMAS.device);
    setFormErrors(validation.errors);
    
    if (!validation.isValid) {
      toast.error('Por favor, corrija os erros no formulário');
      return;
    }
    
    addDeviceMutation.mutate({
      ...newDevice,
      nome: newDevice.nome.trim(),
      localizacao: newDevice.localizacao.trim(),
      descricao: newDevice.descricao.trim()
    });
  };

  const handleEditDevice = (device: Device) => {
    setEditingDevice(device);
    setEditDevice({
      nome: device.nome,
      localizacao: device.localizacao,
      descricao: ''
    });
    setShowEditModal(true);
  };

  const handleUpdateDevice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDevice) return;
    
    // Validate form
    const validation: ValidationResult = validateForm(editDevice, VALIDATION_SCHEMAS.device);
    setFormErrors(validation.errors);
    
    if (!validation.isValid) {
      toast.error('Por favor, corrija os erros no formulário');
      return;
    }
    
    updateDeviceMutation.mutate({ 
      id: editingDevice.id, 
      data: {
        ...editDevice,
        nome: editDevice.nome.trim(),
        localizacao: editDevice.localizacao.trim(),
        descricao: editDevice.descricao.trim()
      }
    });
  };

  const handleDeleteDevice = (device: Device) => {
    setDeviceToDelete(device);
    setShowDeleteDialog(true);
  };
  
  const confirmDeleteDevice = () => {
    if (deviceToDelete) {
      deleteDeviceMutation.mutate(deviceToDelete.id);
      setShowDeleteDialog(false);
      setDeviceToDelete(null);
    }
  };

  const handleTogglePower = (device: Device) => {
    const action = device.status === 'online' ? 'shutdown' : 'restart';
    toggleDevicePowerMutation.mutate({ deviceId: device.id, action });
  };

  if (isLoading) {
    return <LoadingSpinner className="h-64" />;
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'online':
        return <Wifi className="h-4 w-4 text-green-600" />;
      case 'offline':
        return <WifiOff className="h-4 w-4 text-gray-600" />;
      case 'erro':
        return <AlertTriangle className="h-4 w-4 text-red-600" />;
      default:
        return <Monitor className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const classes = {
      online: 'bg-green-100 text-green-800',
      offline: 'bg-gray-100 text-gray-800',
      erro: 'bg-red-100 text-red-800'
    };

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${classes[status as keyof typeof classes]}`}>
        {getStatusIcon(status)}
        <span className="ml-1 capitalize">{status}</span>
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dispositivos</h1>
          <p className="text-gray-600">Gerencie seus dispositivos de sinalização digital</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center"
        >
          <Plus className="h-4 w-4 mr-2" />
          Adicionar Dispositivo
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
          <div className="flex items-center">
            <Monitor className="h-8 w-8 text-blue-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total</p>
              <p className="text-2xl font-bold text-gray-900">{devices?.length || 0}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
          <div className="flex items-center">
            <Wifi className="h-8 w-8 text-green-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Online</p>
              <p className="text-2xl font-bold text-gray-900">
                {devices?.filter(d => d.status === 'online').length || 0}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
          <div className="flex items-center">
            <WifiOff className="h-8 w-8 text-gray-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Offline</p>
              <p className="text-2xl font-bold text-gray-900">
                {devices?.filter(d => d.status === 'offline').length || 0}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
          <div className="flex items-center">
            <AlertTriangle className="h-8 w-8 text-red-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Com Erro</p>
              <p className="text-2xl font-bold text-gray-900">
                {devices?.filter(d => d.status === 'erro').length || 0}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Devices List */}
      <div className="bg-white rounded-lg shadow-md border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Lista de Dispositivos</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Dispositivo
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Última Atividade
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {devices?.map((device) => (
                <tr key={device.id} className="hover:bg-gray-50">
                  <td 
                    className="px-6 py-4 whitespace-nowrap cursor-pointer"
                    onClick={() => handleDeviceClick(device)}
                  >
                    <div className="flex items-center">
                      <Monitor className="h-10 w-10 text-gray-400" />
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">
                          {device.nome}
                        </div>
                        <div className="text-sm text-gray-500">
                          {device.localizacao}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(device.status)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(device.ultima_atividade).toLocaleString('pt-BR')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-2">
                      <button 
                        onClick={() => handleEditDevice(device)}
                        className="text-blue-600 hover:text-blue-900 p-1 rounded transition-colors"
                        title="Editar dispositivo"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button 
                        onClick={() => handleTogglePower(device)}
                        className={`p-1 rounded transition-colors ${
                          device.status === 'online' 
                            ? 'text-orange-600 hover:text-orange-900' 
                            : 'text-green-600 hover:text-green-900'
                        }`}
                        title={device.status === 'online' ? 'Desligar dispositivo' : 'Ligar dispositivo'}
                        disabled={toggleDevicePowerMutation.isPending}
                      >
                        <Power className="h-4 w-4" />
                      </button>
                      <button 
                        onClick={() => handleDeleteDevice(device)}
                        className="text-red-600 hover:text-red-900 p-1 rounded transition-colors"
                        title="Remover dispositivo"
                        disabled={deleteDeviceMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Device Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Adicionar Novo Dispositivo
              </h3>
              <form onSubmit={handleAddDevice} className="space-y-4">
                <FormInput
                  label="Nome do Dispositivo"
                  name="nome"
                  value={newDevice.nome}
                  onChange={(e) => {
                    setNewDevice({ ...newDevice, nome: e.target.value });
                    if (formErrors.nome) setFormErrors({ ...formErrors, nome: '' });
                  }}
                  error={formErrors.nome}
                  placeholder="Ex: TV Recepção"
                  required
                  disabled={addDeviceMutation.isPending}
                  maxLength={100}
                />
                
                <FormInput
                  label="Localização"
                  name="localizacao"
                  value={newDevice.localizacao}
                  onChange={(e) => {
                    setNewDevice({ ...newDevice, localizacao: e.target.value });
                    if (formErrors.localizacao) setFormErrors({ ...formErrors, localizacao: '' });
                  }}
                  error={formErrors.localizacao}
                  placeholder="Ex: Recepção Principal"
                  required
                  disabled={addDeviceMutation.isPending}
                  maxLength={200}
                />
                
                <FormInput
                  label="Descrição (opcional)"
                  name="descricao"
                  type="textarea"
                  value={newDevice.descricao}
                  onChange={(e) => {
                    setNewDevice({ ...newDevice, descricao: e.target.value });
                    if (formErrors.descricao) setFormErrors({ ...formErrors, descricao: '' });
                  }}
                  error={formErrors.descricao}
                  placeholder="Descrição adicional..."
                  disabled={addDeviceMutation.isPending}
                  maxLength={500}
                  rows={3}
                />
                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={addDeviceMutation.isPending}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {addDeviceMutation.isPending ? 'Adicionando...' : 'Adicionar'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Edit Device Modal */}
      {showEditModal && editingDevice && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Editar Dispositivo
              </h3>
              <form onSubmit={handleUpdateDevice} className="space-y-4">
                <FormInput
                  label="Nome do Dispositivo"
                  name="nome"
                  value={editDevice.nome}
                  onChange={(e) => {
                    setEditDevice({ ...editDevice, nome: e.target.value });
                    if (formErrors.nome) setFormErrors({ ...formErrors, nome: '' });
                  }}
                  error={formErrors.nome}
                  placeholder="Ex: TV Recepção"
                  required
                  disabled={updateDeviceMutation.isPending}
                  maxLength={100}
                />
                
                <FormInput
                  label="Localização"
                  name="localizacao"
                  value={editDevice.localizacao}
                  onChange={(e) => {
                    setEditDevice({ ...editDevice, localizacao: e.target.value });
                    if (formErrors.localizacao) setFormErrors({ ...formErrors, localizacao: '' });
                  }}
                  error={formErrors.localizacao}
                  placeholder="Ex: Recepção Principal"
                  required
                  disabled={updateDeviceMutation.isPending}
                  maxLength={200}
                />
                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowEditModal(false);
                      setEditingDevice(null);
                      setEditDevice({ nome: '', localizacao: '', descricao: '' });
                    }}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={updateDeviceMutation.isPending}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {updateDeviceMutation.isPending ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
      
      {/* Device Detail Modal */}
      {showDetailModal && selectedDevice && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-10 mx-auto p-5 border w-4/5 max-w-4xl shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-medium text-gray-900">
                  {selectedDevice.nome} - {selectedDevice.localizacao}
                </h3>
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ×
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Device Info */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-medium text-gray-900 mb-3">Informações do Dispositivo</h4>
                  <div className="space-y-2">
                    <p><span className="font-medium">Status:</span> {getStatusBadge(selectedDevice.status)}</p>
                    <p><span className="font-medium">Última Atividade:</span> {new Date(selectedDevice.ultima_atividade).toLocaleString()}</p>
                    <p><span className="font-medium">Criado em:</span> {new Date(selectedDevice.created_at).toLocaleString()}</p>
                  </div>
                </div>

                {/* Content Management */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="font-medium text-gray-900">Gerenciar Conteúdo</h4>
                    <button
                      onClick={() => setShowUploadModal(true)}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-1 rounded transition-colors"
                    >
                      Upload
                    </button>
                  </div>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {deviceContent.length > 0 ? (
                      deviceContent.map((content, index) => (
                        <div key={content.id} className="flex justify-between items-center p-2 bg-white rounded border">
                          <div>
                            <p className="font-medium text-sm">{content.nome}</p>
                            <p className="text-xs text-gray-500">Ordem: {index + 1}</p>
                          </div>
                          <div className="flex space-x-1">
                            <button className="text-blue-600 hover:text-blue-800 text-xs">↑</button>
                            <button className="text-blue-600 hover:text-blue-800 text-xs">↓</button>
                            <button className="text-red-600 hover:text-red-800 text-xs">×</button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-gray-500 text-sm">Nenhum conteúdo configurado</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-end mt-6">
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Upload de Conteúdo
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Selecionar Arquivo
                  </label>
                  <input
                    type="file"
                    accept="image/*,video/*"
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nome do Conteúdo
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Nome para identificar o conteúdo"
                  />
                </div>
              </div>
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                >
                  Upload
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteDialog}
        onClose={() => {
          setShowDeleteDialog(false);
          setDeviceToDelete(null);
        }}
        onConfirm={confirmDeleteDevice}
        title="Remover Dispositivo"
        message={`Tem certeza que deseja remover o dispositivo "${deviceToDelete?.nome}"? Esta ação não pode ser desfeita.`}
        confirmText="Remover"
        cancelText="Cancelar"
        type="danger"
        isLoading={deleteDeviceMutation.isPending}
      />
    </div>
  );
};

export default DevicesPage;
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Upload, FileText, Image, Video, Trash2, Edit, Eye } from 'lucide-react';
import api from '../../utils/api';
import LoadingSpinner from '../../components/LoadingSpinner';
import toast from 'react-hot-toast';

const ContentPage: React.FC = () => {
  // Content data will be fetched from backend API
  const queryClient = useQueryClient();
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadData, setUploadData] = useState({
    title: '',
    description: '',
    type: 'image',
    duration: 10,
    url: ''
  });

  // Fetch content from backend API
  const { data: content, isLoading } = useQuery({
    queryKey: ['content'],
    queryFn: async () => {
      const response = await api.get('/content');
      return response.data;
    }
  });

  const uploadMutation = useMutation({
    mutationFn: async (data: typeof uploadData) => {
      const formData = new FormData();
      if (selectedFile) {
        formData.append('file', selectedFile);
      }
      formData.append('title', data.title);
      formData.append('description', data.description);
      formData.append('duration', data.duration.toString());
      
      // Add URL if provided
      if (data.url) {
        formData.append('url', data.url);
      }
      
      const response = await api.post('/content', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content'] });
      setShowUploadModal(false);
      setUploadData({ title: '', description: '', type: 'image', duration: 10, url: '' });
      setSelectedFile(null);
      toast.success('Conteúdo adicionado com sucesso!');
    },
    onError: () => {
      toast.error('Erro ao adicionar conteúdo');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/content/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content'] });
      toast.success('Conteúdo removido com sucesso!');
    },
    onError: () => {
      toast.error('Erro ao remover conteúdo');
    }
  });

  const handleUpload = (e: React.FormEvent) => {
    e.preventDefault();
    uploadMutation.mutate(uploadData);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (!uploadData.titulo) {
        setUploadData({ ...uploadData, titulo: file.name.split('.')[0] });
      }
    }
  };

  const getContentIcon = (type: string) => {
    switch (type) {
      case 'image':
        return <Image className="h-8 w-8 text-gray-400" />;
      case 'video':
        return <Video className="h-8 w-8 text-gray-400" />;
      default:
        return <FileText className="h-8 w-8 text-gray-400" />;
    }
  };

  if (isLoading) {
    return <LoadingSpinner className="h-64" />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Conteúdo</h1>
          <p className="text-gray-600">Gerencie seus arquivos de mídia</p>
        </div>
        <button
          onClick={() => setShowUploadModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center"
        >
          <Upload className="h-4 w-4 mr-2" />
          Adicionar Conteúdo
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
          <div className="flex items-center">
            <FileText className="h-8 w-8 text-blue-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total</p>
              <p className="text-2xl font-bold text-gray-900">{content?.length || 0}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
          <div className="flex items-center">
            <Image className="h-8 w-8 text-green-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Imagens</p>
              <p className="text-2xl font-bold text-gray-900">
                {content?.filter(c => c.type === 'image').length || 0}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
          <div className="flex items-center">
            <Video className="h-8 w-8 text-purple-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Vídeos</p>
              <p className="text-2xl font-bold text-gray-900">
                {content?.filter(c => c.type === 'video').length || 0}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
          <div className="flex items-center">
            <FileText className="h-8 w-8 text-yellow-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Outros</p>
              <p className="text-2xl font-bold text-gray-900">
                {content?.filter(c => !['image', 'video'].includes(c.type)).length || 0}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {content?.map((item) => (
          <div key={item.id} className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
            <div className="aspect-video bg-gray-100 flex items-center justify-center">
              {getContentIcon(item.type)}
            </div>
            <div className="p-4">
              <h3 className="font-medium text-gray-900 truncate">{item.title}</h3>
              <p className="text-sm text-gray-500 mt-1 line-clamp-2">{item.duration}s</p>
              <div className="flex items-center justify-between mt-4">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  {item.type}
                </span>
                <div className="flex space-x-2">
                  <button className="text-blue-600 hover:text-blue-900">
                    <Eye className="h-4 w-4" />
                  </button>
                  <button className="text-gray-600 hover:text-gray-900">
                    <Edit className="h-4 w-4" />
                  </button>
                  <button 
                    onClick={() => deleteMutation.mutate(item.id)}
                    className="text-red-600 hover:text-red-900"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Adicionar Novo Conteúdo
              </h3>
              <form onSubmit={handleUpload} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Arquivo
                  </label>
                  <input
                    type="file"
                    onChange={handleFileSelect}
                    accept="image/*,video/*"
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {selectedFile && (
                    <p className="text-sm text-gray-500 mt-1">
                      Arquivo selecionado: {selectedFile.name}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Título
                  </label>
                  <input
                    type="text"
                    required
                    value={uploadData.title}
                    onChange={(e) => setUploadData({ ...uploadData, title: e.target.value })}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Nome do conteúdo"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Tipo
                  </label>
                  <select
                    value={uploadData.type}
                    onChange={(e) => setUploadData({ ...uploadData, type: e.target.value })}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="image">Imagem</option>
                    <option value="video">Vídeo</option>
                    <option value="text">Texto</option>
                    <option value="url">URL</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    URL (opcional)
                  </label>
                  <input
                    type="url"
                    value={uploadData.url}
                    onChange={(e) => setUploadData({ ...uploadData, url: e.target.value })}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="https://exemplo.com"
                  />
                </div>
                
                {/* Duration selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Duração (segundos)
                  </label>
                  <select
                    value={uploadData.duration}
                    onChange={(e) => setUploadData({ ...uploadData, duration: parseInt(e.target.value) })}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                      <option value={5}>5 segundos</option>
                      <option value={10}>10 segundos</option>
                      <option value={15}>15 segundos</option>
                      <option value={20}>20 segundos</option>
                      <option value={25}>25 segundos</option>
                      <option value={30}>30 segundos</option>
                      <option value={35}>35 segundos</option>
                      <option value={40}>40 segundos</option>
                      <option value={45}>45 segundos</option>
                      <option value={50}>50 segundos</option>
                      <option value={55}>55 segundos</option>
                      <option value={60}>60 segundos</option>
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      Tempo que a imagem ficará visível na tela
                    </p>
                  </div>
                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowUploadModal(false)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={uploadMutation.isPending}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {uploadMutation.isPending ? 'Adicionando...' : 'Adicionar'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContentPage;
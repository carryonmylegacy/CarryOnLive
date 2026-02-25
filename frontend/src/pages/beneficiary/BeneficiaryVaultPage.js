import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import {
  FileText,
  Lock,
  Download,
  FolderOpen,
  File,
  FileImage,
  FileArchive
} from 'lucide-react';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { toast } from 'sonner';
import { Skeleton } from '../../components/ui/skeleton';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const categories = [
  { id: 'all', label: 'All Documents', icon: FolderOpen },
  { id: 'legal', label: 'Legal', icon: FileText },
  { id: 'financial', label: 'Financial', icon: File },
  { id: 'personal', label: 'Personal', icon: FileImage },
  { id: 'medical', label: 'Medical', icon: FileArchive },
];

const BeneficiaryVaultPage = () => {
  const { getAuthHeaders } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [estates, setEstates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('all');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const estatesRes = await axios.get(`${API_URL}/estates`, getAuthHeaders());
      setEstates(estatesRes.data);
      
      // Fetch documents from all accessible estates
      const transitionedEstates = estatesRes.data.filter(e => e.status === 'transitioned');
      const allDocs = [];
      
      for (const estate of transitionedEstates) {
        const docsRes = await axios.get(`${API_URL}/documents/${estate.id}`, getAuthHeaders());
        allDocs.push(...docsRes.data.map(d => ({ ...d, estate_name: estate.name })));
      }
      
      setDocuments(allDocs);
    } catch (error) {
      console.error('Fetch error:', error);
      toast.error('Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  const getFileIcon = (fileType) => {
    if (fileType?.includes('image')) return FileImage;
    if (fileType?.includes('zip') || fileType?.includes('archive')) return FileArchive;
    return FileText;
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const filteredDocs = activeCategory === 'all' 
    ? documents 
    : documents.filter(d => d.category === activeCategory);

  const hasAccessibleEstates = estates.some(e => e.status === 'transitioned');

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-12 w-64 bg-white/5" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-40 bg-white/5 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!hasAccessibleEstates) {
    return (
      <div className="p-6 animate-fade-in">
        <h1 className="text-3xl font-bold text-white mb-6" style={{ fontFamily: 'Outfit, sans-serif' }}>
          Document Vault
        </h1>
        <Card className="glass-card">
          <CardContent className="p-12 text-center">
            <Lock className="w-16 h-16 mx-auto text-[#f59e0b] mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">Documents Locked</h3>
            <p className="text-[#94a3b8]">
              You'll have access to estate documents once the estate has been transitioned.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in" data-testid="beneficiary-vault">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
          Document Vault
        </h1>
        <p className="text-[#94a3b8] mt-1">
          Access documents from your inherited estates
        </p>
      </div>

      {/* Category Tabs */}
      <Tabs value={activeCategory} onValueChange={setActiveCategory}>
        <TabsList className="bg-white/5 p-1">
          {categories.map((cat) => (
            <TabsTrigger
              key={cat.id}
              value={cat.id}
              className="data-[state=active]:bg-[#d4af37] data-[state=active]:text-[#0b1120]"
            >
              <cat.icon className="w-4 h-4 mr-2" />
              {cat.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={activeCategory} className="mt-6">
          {filteredDocs.length === 0 ? (
            <Card className="glass-card">
              <CardContent className="p-12 text-center">
                <FolderOpen className="w-16 h-16 mx-auto text-[#64748b] mb-4" />
                <h3 className="text-xl font-semibold text-white mb-2">No documents in this category</h3>
                <p className="text-[#94a3b8]">
                  Check other categories or wait for more documents to be added.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredDocs.map((doc) => {
                const FileIcon = getFileIcon(doc.file_type);
                return (
                  <Card key={doc.id} className="glass-card group" data-testid={`doc-${doc.id}`}>
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between mb-4">
                        <div className="w-12 h-12 rounded-xl bg-[#d4af37]/20 flex items-center justify-center">
                          <FileIcon className="w-6 h-6 text-[#d4af37]" />
                        </div>
                      </div>
                      
                      <h3 className="text-white font-medium mb-1 truncate">{doc.name}</h3>
                      <p className="text-[#64748b] text-sm mb-1">
                        {formatFileSize(doc.file_size)} · {doc.category}
                      </p>
                      <p className="text-[#94a3b8] text-xs mb-3">
                        From: {doc.estate_name}
                      </p>
                      
                      <Button variant="ghost" size="sm" className="text-[#d4af37] hover:text-[#fcd34d]">
                        <Download className="w-4 h-4 mr-2" />
                        Download
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default BeneficiaryVaultPage;

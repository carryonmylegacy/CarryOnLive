import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import {
  Home,
  Clock,
  CheckCircle2,
  Lock,
  FileText,
  MessageSquare,
  Users,
  ChevronRight,
  Heart
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Skeleton } from '../../components/ui/skeleton';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const BeneficiaryHubPage = () => {
  const { user, getAuthHeaders } = useAuth();
  const navigate = useNavigate();
  const [estates, setEstates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCondolences, setShowCondolences] = useState(false);
  const [selectedEstate, setSelectedEstate] = useState(null);

  useEffect(() => {
    fetchEstates();
  }, []);

  const fetchEstates = async () => {
    try {
      const response = await axios.get(`${API_URL}/estates`, getAuthHeaders());
      setEstates(response.data);
      
      // Check for newly transitioned estates that user hasn't seen
      const transitioned = response.data.filter(e => e.status === 'transitioned');
      if (transitioned.length > 0) {
        const seenEstates = JSON.parse(localStorage.getItem('seen_transitions') || '[]');
        const unseenTransitioned = transitioned.find(e => !seenEstates.includes(e.id));
        if (unseenTransitioned) {
          setSelectedEstate(unseenTransitioned);
          setShowCondolences(true);
        }
      }
    } catch (error) {
      console.error('Fetch error:', error);
      toast.error('Failed to load estates');
    } finally {
      setLoading(false);
    }
  };

  const handleCondolenceClose = () => {
    if (selectedEstate) {
      const seenEstates = JSON.parse(localStorage.getItem('seen_transitions') || '[]');
      seenEstates.push(selectedEstate.id);
      localStorage.setItem('seen_transitions', JSON.stringify(seenEstates));
    }
    setShowCondolences(false);
    setSelectedEstate(null);
  };

  const getEstateStatus = (estate) => {
    if (estate.status === 'transitioned') {
      return { color: '#10b981', icon: CheckCircle2, label: 'Accessible' };
    }
    return { color: '#f59e0b', icon: Lock, label: 'Pending Transition' };
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-12 w-64 bg-white/5" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map(i => (
            <Skeleton key={i} className="h-48 bg-white/5 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in" data-testid="beneficiary-hub">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
          Estate Hub
        </h1>
        <p className="text-[#94a3b8] mt-1">
          View and access estates you've been designated to receive
        </p>
      </div>

      {/* Estates Grid */}
      {estates.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="p-12 text-center">
            <Home className="w-16 h-16 mx-auto text-[#64748b] mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">No Estates Found</h3>
            <p className="text-[#94a3b8]">
              You haven't been designated as a beneficiary for any estates yet.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {estates.map((estate) => {
            const status = getEstateStatus(estate);
            const StatusIcon = status.icon;
            
            return (
              <Card
                key={estate.id}
                className={`glass-card cursor-pointer transition-all hover:-translate-y-1 ${
                  estate.status === 'transitioned' ? 'border-[#10b981]/30' : 'border-white/10'
                }`}
                onClick={() => {
                  if (estate.status === 'transitioned') {
                    navigate(`/beneficiary/estate/${estate.id}`);
                  }
                }}
                data-testid={`estate-${estate.id}`}
              >
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-4">
                      <div
                        className="w-14 h-14 rounded-2xl flex items-center justify-center"
                        style={{ backgroundColor: `${status.color}20` }}
                      >
                        <StatusIcon className="w-7 h-7" style={{ color: status.color }} />
                      </div>
                      <div>
                        <h3 className="text-xl font-semibold text-white">{estate.name}</h3>
                        <p className="text-[#94a3b8] text-sm">
                          Created {new Date(estate.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span
                      className="px-3 py-1 rounded-full text-sm font-medium"
                      style={{
                        backgroundColor: `${status.color}20`,
                        color: status.color
                      }}
                    >
                      {status.label}
                    </span>
                    
                    {estate.status === 'transitioned' ? (
                      <Button variant="ghost" className="text-[#d4af37] hover:text-[#fcd34d]">
                        View Estate <ChevronRight className="w-4 h-4 ml-1" />
                      </Button>
                    ) : (
                      <span className="text-[#64748b] text-sm flex items-center gap-1">
                        <Lock className="w-4 h-4" />
                        Locked
                      </span>
                    )}
                  </div>

                  {estate.status === 'transitioned' && (
                    <div className="mt-4 pt-4 border-t border-white/10 grid grid-cols-3 gap-4 text-center">
                      <div>
                        <FileText className="w-5 h-5 mx-auto text-[#3b82f6] mb-1" />
                        <p className="text-white font-semibold">Docs</p>
                        <p className="text-[#64748b] text-xs">Available</p>
                      </div>
                      <div>
                        <MessageSquare className="w-5 h-5 mx-auto text-[#10b981] mb-1" />
                        <p className="text-white font-semibold">Messages</p>
                        <p className="text-[#64748b] text-xs">Delivered</p>
                      </div>
                      <div>
                        <Users className="w-5 h-5 mx-auto text-[#8b5cf6] mb-1" />
                        <p className="text-white font-semibold">{estate.beneficiaries?.length || 1}</p>
                        <p className="text-[#64748b] text-xs">Beneficiaries</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pre-Transition Info */}
      {estates.some(e => e.status !== 'transitioned') && (
        <Card className="glass-card">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#f59e0b]/20 flex items-center justify-center flex-shrink-0">
                <Clock className="w-6 h-6 text-[#f59e0b]" />
              </div>
              <div>
                <h3 className="text-white font-semibold mb-1">About Pending Estates</h3>
                <p className="text-[#94a3b8] text-sm">
                  Estates marked as "Pending Transition" are currently being prepared by the estate owner. 
                  You will gain full access to documents and messages once the estate has been transitioned.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Condolences Modal */}
      <Dialog open={showCondolences} onOpenChange={handleCondolenceClose}>
        <DialogContent className="glass-card border-white/10 sm:max-w-md text-center">
          <DialogHeader>
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#d4af37]/20 flex items-center justify-center">
              <Heart className="w-8 h-8 text-[#d4af37]" />
            </div>
            <DialogTitle className="text-white text-2xl" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Our Deepest Condolences
            </DialogTitle>
            <DialogDescription className="text-[#94a3b8]">
              We're deeply sorry for your loss.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <p className="text-[#94a3b8] mb-4">
              {selectedEstate?.name} has been transitioned to you and other designated beneficiaries. 
              The documents and messages left for you are now accessible.
            </p>
            <p className="text-white font-medium">
              Take all the time you need. The estate will be here when you're ready.
            </p>
          </div>
          
          <Button onClick={handleCondolenceClose} className="gold-button w-full">
            Continue to Estate
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BeneficiaryHubPage;

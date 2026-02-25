import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import {
  CheckSquare,
  Square,
  CheckCircle2,
  Clock,
  FileText,
  Users,
  Briefcase,
  Heart
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Progress } from '../components/ui/progress';
import { toast } from 'sonner';
import { Skeleton } from '../components/ui/skeleton';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const categoryIcons = {
  legal: FileText,
  financial: Briefcase,
  family: Users,
  messages: Heart,
};

const ChecklistPage = () => {
  const { getAuthHeaders } = useAuth();
  const [checklists, setChecklists] = useState([]);
  const [estate, setEstate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const estatesRes = await axios.get(`${API_URL}/estates`, getAuthHeaders());
      if (estatesRes.data.length > 0) {
        setEstate(estatesRes.data[0]);
        const checklistRes = await axios.get(`${API_URL}/checklists/${estatesRes.data[0].id}`, getAuthHeaders());
        setChecklists(checklistRes.data);
      }
    } catch (error) {
      console.error('Fetch error:', error);
      toast.error('Failed to load checklist');
    } finally {
      setLoading(false);
    }
  };

  const toggleItem = async (itemId) => {
    setUpdating(itemId);
    try {
      const response = await axios.patch(`${API_URL}/checklists/${itemId}/toggle`, {}, getAuthHeaders());
      setChecklists(checklists.map(item => 
        item.id === itemId ? { ...item, is_completed: response.data.is_completed } : item
      ));
      
      if (response.data.is_completed) {
        toast.success('Task completed! 🎉');
      }
    } catch (error) {
      console.error('Toggle error:', error);
      toast.error('Failed to update task');
    } finally {
      setUpdating(null);
    }
  };

  const completedCount = checklists.filter(c => c.is_completed).length;
  const totalCount = checklists.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Group by category
  const groupedChecklists = checklists.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-12 w-64 bg-white/5" />
        <Skeleton className="h-24 w-full bg-white/5 rounded-2xl" />
        <div className="space-y-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-16 bg-white/5 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in" data-testid="action-checklist">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
          Immediate Action Checklist
        </h1>
        <p className="text-[#94a3b8] mt-1">
          Complete these tasks to ensure your estate is ready
        </p>
      </div>

      {/* Progress Card */}
      <Card className="glass-card">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-xl font-semibold text-white">Overall Progress</h2>
              <p className="text-[#94a3b8]">{completedCount} of {totalCount} tasks completed</p>
            </div>
            <div className="text-4xl font-bold text-[#d4af37]" style={{ fontFamily: 'Outfit, sans-serif' }}>
              {progressPercent}%
            </div>
          </div>
          <Progress value={progressPercent} className="h-3 bg-white/10" />
        </CardContent>
      </Card>

      {/* Checklist by Category */}
      <div className="space-y-6">
        {Object.entries(groupedChecklists).map(([category, items]) => {
          const CategoryIcon = categoryIcons[category] || CheckSquare;
          const categoryCompleted = items.filter(i => i.is_completed).length;
          
          return (
            <Card key={category} className="glass-card" data-testid={`checklist-category-${category}`}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#d4af37]/20 flex items-center justify-center">
                      <CategoryIcon className="w-5 h-5 text-[#d4af37]" />
                    </div>
                    <CardTitle className="text-white capitalize">{category}</CardTitle>
                  </div>
                  <span className="text-sm text-[#94a3b8]">
                    {categoryCompleted}/{items.length}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {items.sort((a, b) => a.order - b.order).map((item) => (
                  <div
                    key={item.id}
                    onClick={() => toggleItem(item.id)}
                    className={`flex items-center gap-4 p-4 rounded-xl cursor-pointer transition-all ${
                      item.is_completed 
                        ? 'bg-[#10b981]/10 border border-[#10b981]/20' 
                        : 'bg-white/5 hover:bg-white/10 border border-transparent'
                    }`}
                    data-testid={`checklist-item-${item.id}`}
                  >
                    <div className={`flex-shrink-0 ${updating === item.id ? 'animate-pulse' : ''}`}>
                      {item.is_completed ? (
                        <CheckCircle2 className="w-6 h-6 text-[#10b981]" />
                      ) : (
                        <Square className="w-6 h-6 text-[#64748b]" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className={`font-medium ${
                        item.is_completed ? 'text-[#94a3b8] line-through' : 'text-white'
                      }`}>
                        {item.title}
                      </h3>
                      <p className="text-[#64748b] text-sm truncate">{item.description}</p>
                    </div>
                    {item.is_completed && item.completed_at && (
                      <div className="flex items-center gap-1 text-[#64748b] text-xs">
                        <Clock className="w-3 h-3" />
                        <span>Done</span>
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default ChecklistPage;

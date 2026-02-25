import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import {
  Clock,
  FileText,
  MessageSquare,
  Users,
  CheckSquare,
  Upload,
  Home,
  Shield,
  Activity
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { ScrollArea } from '../ui/scroll-area';
import { Skeleton } from '../ui/skeleton';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const actionIcons = {
  estate_created: Home,
  estate_updated: Home,
  document_uploaded: FileText,
  document_deleted: FileText,
  message_created: MessageSquare,
  message_deleted: MessageSquare,
  beneficiary_added: Users,
  beneficiary_removed: Users,
  checklist_completed: CheckSquare,
  certificate_uploaded: Upload,
  estate_transitioned: Shield,
};

const actionColors = {
  estate_created: '#d4af37',
  estate_updated: '#d4af37',
  document_uploaded: '#2563eb',
  document_deleted: '#ef4444',
  message_created: '#10b981',
  message_deleted: '#ef4444',
  beneficiary_added: '#8b5cf6',
  beneficiary_removed: '#ef4444',
  checklist_completed: '#10b981',
  certificate_uploaded: '#f59e0b',
  estate_transitioned: '#10b981',
};

const ActivityTimeline = ({ estateId, limit = 20 }) => {
  const { getAuthHeaders } = useAuth();
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (estateId) {
      fetchActivities();
    }
  }, [estateId]);

  const fetchActivities = async () => {
    setLoading(true);
    try {
      const response = await axios.get(
        `${API_URL}/activity/${estateId}?limit=${limit}`,
        getAuthHeaders()
      );
      setActivities(response.data);
    } catch (error) {
      console.error('Failed to fetch activities:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTimeAgo = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-[#d4af37]" />
            Activity Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="w-10 h-10 rounded-full bg-white/5" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4 bg-white/5" />
                  <Skeleton className="h-3 w-1/4 bg-white/5" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card" data-testid="activity-timeline">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Activity className="w-5 h-5 text-[#d4af37]" />
          Activity Timeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <div className="text-center py-8">
            <Clock className="w-12 h-12 mx-auto text-[#64748b] mb-3" />
            <p className="text-[#94a3b8]">No activity yet</p>
            <p className="text-[#64748b] text-sm">
              Actions you take will appear here
            </p>
          </div>
        ) : (
          <ScrollArea className="h-[400px] pr-4">
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-5 top-0 bottom-0 w-px bg-white/10" />
              
              <div className="space-y-4">
                {activities.map((activity, index) => {
                  const Icon = actionIcons[activity.action] || Clock;
                  const color = actionColors[activity.action] || '#94a3b8';
                  
                  return (
                    <div
                      key={activity.id}
                      className="flex items-start gap-4 relative"
                      data-testid={`activity-${activity.id}`}
                    >
                      {/* Icon */}
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 z-10"
                        style={{ backgroundColor: `${color}20` }}
                      >
                        <Icon className="w-5 h-5" style={{ color }} />
                      </div>
                      
                      {/* Content */}
                      <div className="flex-1 min-w-0 pb-4">
                        <p className="text-white text-sm">{activity.description}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[#64748b] text-xs">
                            {activity.user_name}
                          </span>
                          <span className="text-[#64748b] text-xs">•</span>
                          <span className="text-[#64748b] text-xs">
                            {formatTimeAgo(activity.created_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};

export default ActivityTimeline;

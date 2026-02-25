import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { Bell, X, Check, FileText, MessageSquare, Users, Shield, Clock } from 'lucide-react';
import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '../ui/sheet';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const notificationIcons = {
  document_uploaded: FileText,
  message_created: MessageSquare,
  beneficiary_added: Users,
  estate_transitioned: Shield,
  checklist_completed: Check,
};

const NotificationCenter = ({ estateId }) => {
  const { getAuthHeaders } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (estateId) fetchNotifications();
  }, [estateId]);

  const fetchNotifications = async () => {
    try {
      const response = await axios.get(`${API_URL}/activity/${estateId}?limit=20`, getAuthHeaders());
      setNotifications(response.data);
      const readIds = JSON.parse(localStorage.getItem('read_notifications') || '[]');
      setUnreadCount(response.data.filter(n => !readIds.includes(n.id)).length);
    } catch (error) { console.error('Failed to fetch notifications:', error); }
  };

  const markAllRead = () => {
    const allIds = notifications.map(n => n.id);
    localStorage.setItem('read_notifications', JSON.stringify(allIds));
    setUnreadCount(0);
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" className="relative p-2" data-testid="notification-bell">
          <Bell className="w-5 h-5 text-[#94a3b8]" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-[#d4af37] rounded-full text-[10px] font-bold text-[#0b1120] flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-80 bg-[var(--carryon-bg)] border-l border-white/5 p-0">
        <SheetHeader className="p-4 border-b border-white/5">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-white">Notifications</SheetTitle>
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" onClick={markAllRead} className="text-[#d4af37] text-xs">Mark all read</Button>
            )}
          </div>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-80px)]">
          {notifications.length === 0 ? (
            <div className="p-8 text-center"><Bell className="w-12 h-12 mx-auto text-[#64748b] mb-3" /><p className="text-[#94a3b8]">No notifications yet</p></div>
          ) : (
            <div className="divide-y divide-white/5">
              {notifications.map((notif) => {
                const Icon = notificationIcons[notif.action] || Clock;
                const readIds = JSON.parse(localStorage.getItem('read_notifications') || '[]');
                const isRead = readIds.includes(notif.id);
                return (
                  <div key={notif.id} className={`p-4 ${!isRead ? 'bg-[#d4af37]/5' : ''}`}>
                    <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#d4af37]/20 flex items-center justify-center flex-shrink-0">
                        <Icon className="w-4 h-4 text-[#d4af37]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm">{notif.description}</p>
                        <p className="text-[#64748b] text-xs mt-1">{formatTime(notif.created_at)}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};

export default NotificationCenter;

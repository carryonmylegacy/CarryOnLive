import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import {
  Calendar,
  Gift,
  GraduationCap,
  Heart,
  Star,
  Loader2,
  CheckCircle2,
  MessageSquare
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { toast } from 'sonner';
import { Skeleton } from '../../components/ui/skeleton';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const eventTypes = [
  { value: 'birthday', label: 'Birthday', icon: Gift },
  { value: 'graduation', label: 'Graduation', icon: GraduationCap },
  { value: 'marriage', label: 'Marriage', icon: Heart },
  { value: 'custom', label: 'Custom Event', icon: Star },
];

const MilestoneReportPage = () => {
  const { getAuthHeaders } = useAuth();
  const [estates, setEstates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [deliveredMessages, setDeliveredMessages] = useState(0);
  
  // Form state
  const [selectedEstate, setSelectedEstate] = useState('');
  const [eventType, setEventType] = useState('');
  const [eventDescription, setEventDescription] = useState('');
  const [eventDate, setEventDate] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const estatesRes = await axios.get(`${API_URL}/estates`, getAuthHeaders());
      const transitioned = estatesRes.data.filter(e => e.status === 'transitioned');
      setEstates(transitioned);
      if (transitioned.length > 0) {
        setSelectedEstate(transitioned[0].id);
      }
    } catch (error) {
      console.error('Fetch error:', error);
      toast.error('Failed to load estates');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!selectedEstate || !eventType || !eventDescription || !eventDate) {
      toast.error('Please fill all required fields');
      return;
    }
    
    setSubmitting(true);
    try {
      const response = await axios.post(`${API_URL}/milestones/report`, {
        estate_id: selectedEstate,
        event_type: eventType,
        event_description: eventDescription,
        event_date: eventDate
      }, getAuthHeaders());
      
      setDeliveredMessages(response.data.messages_delivered);
      setSubmitted(true);
      toast.success('Milestone reported successfully!');
    } catch (error) {
      console.error('Submit error:', error);
      toast.error('Failed to report milestone');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setEventType('');
    setEventDescription('');
    setEventDate('');
    setSubmitted(false);
    setDeliveredMessages(0);
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-12 w-64 bg-white/5" />
        <Skeleton className="h-96 w-full bg-white/5 rounded-2xl" />
      </div>
    );
  }

  if (estates.length === 0) {
    return (
      <div className="p-6 animate-fade-in">
        <h1 className="text-3xl font-bold text-white mb-6" style={{ fontFamily: 'Outfit, sans-serif' }}>
          Report Milestone
        </h1>
        <Card className="glass-card">
          <CardContent className="p-12 text-center">
            <Calendar className="w-16 h-16 mx-auto text-[#64748b] mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">No Accessible Estates</h3>
            <p className="text-[#94a3b8]">
              You can report milestones once you have access to a transitioned estate.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in max-w-2xl mx-auto" data-testid="milestone-report">
      {/* Header */}
      <div className="text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[#d4af37]/20 flex items-center justify-center">
          <Calendar className="w-8 h-8 text-[#d4af37]" />
        </div>
        <h1 className="text-3xl font-bold text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
          Report a Milestone
        </h1>
        <p className="text-[#94a3b8] mt-2">
          Report life events to trigger messages left for you
        </p>
      </div>

      {submitted ? (
        <Card className="glass-card">
          <CardContent className="p-8 text-center">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-[#10b981]/20 flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10 text-[#10b981]" />
            </div>
            <h3 className="text-2xl font-semibold text-white mb-2">Milestone Reported!</h3>
            <p className="text-[#94a3b8] mb-4">
              Your milestone has been recorded successfully.
            </p>
            
            {deliveredMessages > 0 && (
              <div className="p-4 bg-[#d4af37]/10 rounded-xl mb-6">
                <div className="flex items-center justify-center gap-2 text-[#d4af37]">
                  <MessageSquare className="w-5 h-5" />
                  <span className="font-semibold">
                    {deliveredMessages} message{deliveredMessages > 1 ? 's' : ''} delivered!
                  </span>
                </div>
                <p className="text-[#94a3b8] text-sm mt-1">
                  Check your messages to see what was left for you.
                </p>
              </div>
            )}
            
            <Button onClick={resetForm} className="gold-button">
              Report Another Milestone
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-white">Event Details</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Estate Selection */}
              {estates.length > 1 && (
                <div className="space-y-2">
                  <Label className="text-[#94a3b8]">Estate</Label>
                  <Select value={selectedEstate} onValueChange={setSelectedEstate}>
                    <SelectTrigger className="input-field">
                      <SelectValue placeholder="Select estate" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1A2440] border-white/10">
                      {estates.map((estate) => (
                        <SelectItem key={estate.id} value={estate.id}>{estate.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              {/* Event Type */}
              <div className="space-y-2">
                <Label className="text-[#94a3b8]">Event Type</Label>
                <Select value={eventType} onValueChange={setEventType}>
                  <SelectTrigger className="input-field" data-testid="event-type-select">
                    <SelectValue placeholder="Select event type" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1A2440] border-white/10">
                    {eventTypes.map((event) => (
                      <SelectItem key={event.value} value={event.value}>
                        <div className="flex items-center gap-2">
                          <event.icon className="w-4 h-4" />
                          {event.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Event Date */}
              <div className="space-y-2">
                <Label className="text-[#94a3b8]">Event Date</Label>
                <Input
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  className="input-field"
                  data-testid="event-date-input"
                />
              </div>
              
              {/* Description */}
              <div className="space-y-2">
                <Label className="text-[#94a3b8]">Description</Label>
                <Textarea
                  value={eventDescription}
                  onChange={(e) => setEventDescription(e.target.value)}
                  placeholder="Describe this milestone event..."
                  className="input-field min-h-[100px]"
                  data-testid="event-description-input"
                />
              </div>
              
              <Button
                type="submit"
                disabled={submitting}
                className="gold-button w-full"
                data-testid="submit-milestone-button"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Reporting...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5 mr-2" />
                    Report Milestone
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Info Card */}
      <Card className="glass-card">
        <CardContent className="p-6">
          <h3 className="text-white font-semibold mb-2">About Milestone Messages</h3>
          <p className="text-[#94a3b8] text-sm">
            Your loved one may have left messages to be delivered when you reach certain life milestones. 
            By reporting these events, you may unlock special messages that were prepared for these moments.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default MilestoneReportPage;

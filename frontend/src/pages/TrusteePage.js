import React from 'react';
import {
  Award,
  Shield,
  Users,
  FileText,
  Clock,
  CheckCircle,
  Star,
  ChevronRight
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';

const plans = [
  {
    id: 'basic',
    name: 'Basic',
    price: '$99',
    period: '/year',
    description: 'Essential estate planning tools',
    features: [
      'Document Vault (5GB)',
      'Up to 3 Beneficiaries',
      '5 Milestone Messages',
      'Basic AI Guardian',
      'Email Support'
    ],
    popular: false
  },
  {
    id: 'premium',
    name: 'Premium',
    price: '$249',
    period: '/year',
    description: 'Complete estate management',
    features: [
      'Document Vault (25GB)',
      'Unlimited Beneficiaries',
      'Unlimited Messages',
      'Advanced AI Guardian',
      'Video Messages',
      'Priority Support',
      'Legal Document Templates'
    ],
    popular: true
  },
  {
    id: 'family',
    name: 'Family Trust',
    price: '$499',
    period: '/year',
    description: 'For complex family estates',
    features: [
      'Document Vault (100GB)',
      'Multiple Estates',
      'All Premium Features',
      'Dedicated Trust Advisor',
      'Annual Estate Review',
      'Legal Consultation',
      'Tax Planning Assistance'
    ],
    popular: false
  }
];

const TrusteePage = () => {
  return (
    <div className="p-6 space-y-6 animate-fade-in" data-testid="trustee-services">
      {/* Header */}
      <div className="text-center max-w-2xl mx-auto mb-8">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-[#d4af37] to-[#fcd34d] flex items-center justify-center gold-glow">
          <Award className="w-8 h-8 text-[#0b1120]" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-3" style={{ fontFamily: 'Outfit, sans-serif' }}>
          Trustee Services
        </h1>
        <p className="text-[#94a3b8]">
          Professional estate management and trustee services to ensure your legacy is protected
        </p>
      </div>

      {/* Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {plans.map((plan) => (
          <Card
            key={plan.id}
            className={`glass-card relative overflow-hidden ${
              plan.popular ? 'border-[#d4af37]/50 gold-glow' : ''
            }`}
            data-testid={`plan-${plan.id}`}
          >
            {plan.popular && (
              <div className="absolute top-0 right-0 bg-gradient-to-r from-[#d4af37] to-[#fcd34d] px-4 py-1 rounded-bl-xl">
                <span className="text-[#0b1120] text-xs font-bold flex items-center gap-1">
                  <Star className="w-3 h-3" />
                  Most Popular
                </span>
              </div>
            )}
            
            <CardHeader>
              <CardTitle className="text-white">{plan.name}</CardTitle>
              <p className="text-[#64748b] text-sm">{plan.description}</p>
            </CardHeader>
            
            <CardContent className="space-y-6">
              <div>
                <span className="text-4xl font-bold text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
                  {plan.price}
                </span>
                <span className="text-[#64748b]">{plan.period}</span>
              </div>
              
              <ul className="space-y-3">
                {plan.features.map((feature, index) => (
                  <li key={index} className="flex items-center gap-2 text-[#94a3b8] text-sm">
                    <CheckCircle className="w-4 h-4 text-[#10b981] flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
              
              <Button
                className={`w-full ${plan.popular ? 'gold-button' : 'secondary-button'}`}
                data-testid={`select-plan-${plan.id}`}
              >
                {plan.popular ? 'Get Started' : 'Choose Plan'}
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Additional Services */}
      <div className="max-w-5xl mx-auto mt-12">
        <h2 className="text-2xl font-bold text-white mb-6 text-center" style={{ fontFamily: 'Outfit, sans-serif' }}>
          Additional Services
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="glass-card">
            <CardContent className="p-6 flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#3b82f6]/20 flex items-center justify-center flex-shrink-0">
                <FileText className="w-6 h-6 text-[#3b82f6]" />
              </div>
              <div>
                <h3 className="text-white font-semibold mb-1">Legal Document Review</h3>
                <p className="text-[#94a3b8] text-sm mb-3">
                  Have our legal partners review your estate documents for completeness and validity.
                </p>
                <span className="text-[#d4af37] font-semibold">$199/review</span>
              </div>
            </CardContent>
          </Card>
          
          <Card className="glass-card">
            <CardContent className="p-6 flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#10b981]/20 flex items-center justify-center flex-shrink-0">
                <Users className="w-6 h-6 text-[#10b981]" />
              </div>
              <div>
                <h3 className="text-white font-semibold mb-1">Family Mediation</h3>
                <p className="text-[#94a3b8] text-sm mb-3">
                  Professional mediation services to help families navigate estate discussions.
                </p>
                <span className="text-[#d4af37] font-semibold">$299/session</span>
              </div>
            </CardContent>
          </Card>
          
          <Card className="glass-card">
            <CardContent className="p-6 flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#8b5cf6]/20 flex items-center justify-center flex-shrink-0">
                <Shield className="w-6 h-6 text-[#8b5cf6]" />
              </div>
              <div>
                <h3 className="text-white font-semibold mb-1">Digital Asset Protection</h3>
                <p className="text-[#94a3b8] text-sm mb-3">
                  Secure management of digital assets including cryptocurrency and online accounts.
                </p>
                <span className="text-[#d4af37] font-semibold">$149/year</span>
              </div>
            </CardContent>
          </Card>
          
          <Card className="glass-card">
            <CardContent className="p-6 flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#f59e0b]/20 flex items-center justify-center flex-shrink-0">
                <Clock className="w-6 h-6 text-[#f59e0b]" />
              </div>
              <div>
                <h3 className="text-white font-semibold mb-1">Annual Estate Review</h3>
                <p className="text-[#94a3b8] text-sm mb-3">
                  Comprehensive annual review to ensure your estate plan stays current.
                </p>
                <span className="text-[#d4af37] font-semibold">$299/year</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Payment Notice */}
      <div className="max-w-2xl mx-auto text-center mt-8">
        <p className="text-[#64748b] text-sm">
          Payment processing coming soon. Contact support for early access pricing.
        </p>
      </div>
    </div>
  );
};

export default TrusteePage;

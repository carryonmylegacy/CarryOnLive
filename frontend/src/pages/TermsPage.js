import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';

const TermsPage = () => {
  return (
    <div
      className="min-h-screen py-12 px-4"
      style={{ background: 'linear-gradient(145deg, #0F1629, #141C33 40%, #0F1629)' }}
    >
      <div className="max-w-3xl mx-auto relative z-10">
        <Link to="/login" className="inline-flex items-center gap-2 text-[#A0AABF] hover:text-white mb-8 transition-colors" data-testid="terms-back-link">
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>

        <div className="glass-card p-8 md:p-12">
          <div className="flex items-center gap-3 mb-6">
            <FileText className="w-7 h-7 text-[#d4af37]" />
            <h1 className="text-3xl font-bold text-[#F1F3F8]" style={{ fontFamily: 'Outfit, sans-serif' }} data-testid="terms-page-title">
              Terms of Service
            </h1>
          </div>
          <p className="text-[#7B879E] text-sm mb-8">Last updated: February 2026</p>

          <div className="space-y-8 text-[#C0C8D8] text-sm leading-relaxed">
            <section>
              <h2 className="text-lg font-semibold text-[#F1F3F8] mb-3">1. Acceptance of Terms</h2>
              <p>
                By accessing or using CarryOn&trade; (the &quot;Service&quot;), you agree to be bound by these Terms of Service (&quot;Terms&quot;). If you do not agree to these Terms, do not use the Service. We reserve the right to modify these Terms at any time, and your continued use of the Service constitutes acceptance of any changes.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-[#F1F3F8] mb-3">2. Description of Service</h2>
              <p>
                CarryOn&trade; is an estate planning and estate plan management platform that enables users to organize, secure, and communicate their estate plans to designated beneficiaries. The Service includes document storage, beneficiary management, checklist tools, AI-powered estate analysis, voice biometric verification, and related features.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-[#F1F3F8] mb-3">3. Account Registration</h2>
              <p className="mb-3">
                To use the Service, you must create an account and provide accurate, complete, and current information. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.
              </p>
              <p>
                You must be at least 18 years old to create an account. By registering, you represent that you are of legal age and have the capacity to enter into a binding agreement.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-[#F1F3F8] mb-3">4. SMS Communications Consent</h2>
              <p className="mb-3">
                By providing your phone number and opting in to SMS communications during registration or account settings, you expressly consent to receive text messages from CarryOn&trade; for account verification and security purposes, including one-time passcodes (OTPs) for two-factor authentication.
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Message frequency varies based on account activity</li>
                <li>Message and data rates may apply</li>
                <li>You may opt out at any time by replying STOP</li>
                <li>For help, reply HELP or contact support</li>
                <li>Carriers are not liable for delayed or undelivered messages</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-[#F1F3F8] mb-3">5. Acceptable Use</h2>
              <p className="mb-3">You agree not to:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Use the Service for any unlawful purpose</li>
                <li>Attempt to gain unauthorized access to any part of the Service</li>
                <li>Interfere with or disrupt the Service or its infrastructure</li>
                <li>Upload malicious content, viruses, or harmful code</li>
                <li>Impersonate any person or misrepresent your affiliation</li>
                <li>Use automated means to access the Service without permission</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-[#F1F3F8] mb-3">6. Intellectual Property</h2>
              <p>
                The Service, including its design, features, content, and underlying technology, is owned by CarryOn&trade; and protected by intellectual property laws. You retain ownership of the content you upload. By using the Service, you grant us a limited license to store, process, and display your content solely for the purpose of providing the Service.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-[#F1F3F8] mb-3">7. Payment Terms</h2>
              <p>
                Certain features of the Service may require a paid subscription. All payments are processed securely through our payment provider (Stripe). Subscription fees are billed in advance on a recurring basis. You may cancel your subscription at any time through your account settings.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-[#F1F3F8] mb-3">8. Disclaimer of Warranties</h2>
              <p>
                THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED. CARRYON&trade; DOES NOT PROVIDE LEGAL, FINANCIAL, OR TAX ADVICE. THE SERVICE IS A TOOL FOR ORGANIZING ESTATE PLANNING INFORMATION AND IS NOT A SUBSTITUTE FOR PROFESSIONAL LEGAL COUNSEL.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-[#F1F3F8] mb-3">9. Limitation of Liability</h2>
              <p>
                TO THE FULLEST EXTENT PERMITTED BY LAW, CARRYON&trade; SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF DATA, PROFITS, OR GOODWILL, ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF THE SERVICE.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-[#F1F3F8] mb-3">10. Termination</h2>
              <p>
                We reserve the right to suspend or terminate your account at our discretion if you violate these Terms. Upon termination, your right to use the Service will immediately cease. You may request export of your data prior to account deletion.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-[#F1F3F8] mb-3">11. Governing Law</h2>
              <p>
                These Terms shall be governed by and construed in accordance with the laws of the United States, without regard to conflict of law principles.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-[#F1F3F8] mb-3">12. Contact Us</h2>
              <p>
                If you have questions about these Terms, please contact us at: <a href="mailto:support@carryon.com" className="text-[#7AABFD] hover:text-[#A5C6FE] transition-colors">support@carryon.com</a>
              </p>
            </section>
          </div>
        </div>

        <div className="mt-6 text-center space-x-4">
          <Link to="/privacy" className="text-[#7AABFD] text-sm hover:text-[#A5C6FE] transition-colors" data-testid="terms-to-privacy-link">Privacy Policy</Link>
          <span className="text-[#525C72]">&middot;</span>
          <Link to="/login" className="text-[#7AABFD] text-sm hover:text-[#A5C6FE] transition-colors">Sign In</Link>
        </div>
      </div>
    </div>
  );
};

export default TermsPage;

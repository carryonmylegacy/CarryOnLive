import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Shield } from 'lucide-react';

const PrivacyPolicyPage = () => {
  return (
    <div
      className="min-h-screen py-12 px-4"
      style={{ background: 'linear-gradient(145deg, #0F1629, #141C33 40%, #0F1629)' }}
    >
      <div className="max-w-3xl mx-auto relative z-10">
        <Link to="/login" className="inline-flex items-center gap-2 text-[#A0AABF] hover:text-white mb-8 transition-colors" data-testid="privacy-back-link">
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>

        <div className="glass-card p-8 md:p-12">
          <div className="flex items-center gap-3 mb-6">
            <Shield className="w-7 h-7 text-[#d4af37]" />
            <h1 className="text-3xl font-bold text-[#F1F3F8]" style={{ fontFamily: 'Outfit, sans-serif' }} data-testid="privacy-page-title">
              Privacy Policy
            </h1>
          </div>
          <p className="text-[#7B879E] text-sm mb-8">Last updated: February 2026</p>

          <div className="space-y-8 text-[#C0C8D8] text-sm leading-relaxed">
            <section>
              <h2 className="text-lg font-semibold text-[#F1F3F8] mb-3">1. Introduction</h2>
              <p>
                CarryOn&trade; (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our estate planning platform, including our website and related services (collectively, the &quot;Service&quot;).
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-[#F1F3F8] mb-3">2. Information We Collect</h2>
              <p className="mb-3">We collect information you provide directly to us, including:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Personal identification information (name, email address, phone number)</li>
                <li>Account credentials (encrypted passwords)</li>
                <li>Estate planning data (beneficiary information, documents, checklists)</li>
                <li>Voice biometric data (voiceprints for identity verification)</li>
                <li>Payment information (processed securely through Stripe)</li>
                <li>Communications (support messages, feedback)</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-[#F1F3F8] mb-3">3. How We Use Your Information</h2>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Provide, maintain, and improve the Service</li>
                <li>Process transactions and send related information</li>
                <li>Send verification codes via email or SMS for two-factor authentication</li>
                <li>Respond to customer service requests and support needs</li>
                <li>Protect against fraud and unauthorized access</li>
                <li>Comply with legal obligations</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-[#F1F3F8] mb-3">4. SMS/Text Messaging</h2>
              <p className="mb-3">
                When you opt in to receive SMS messages from CarryOn&trade;, you consent to receive text messages related to account verification and security (e.g., one-time passcodes for two-factor authentication). Message frequency varies based on your account activity. Message and data rates may apply.
              </p>
              <p className="mb-3">
                You can opt out of SMS messages at any time by replying STOP to any message or by updating your preferences in your account settings. For help, reply HELP or contact us at the information provided below.
              </p>
              <p>
                We do not sell, rent, or share your phone number or SMS opt-in data with third parties for marketing purposes. Your information is shared only with service providers who assist in delivering messages (e.g., Twilio).
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-[#F1F3F8] mb-3">5. Data Security</h2>
              <p>
                We implement industry-standard security measures, including AES-256 encryption, zero-knowledge architecture, and SOC 2 compliance practices. Your sensitive documents are encrypted at rest and in transit. Voice biometric data is stored as mathematical representations (voiceprints) and cannot be reverse-engineered into audio.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-[#F1F3F8] mb-3">6. Data Sharing and Disclosure</h2>
              <p className="mb-3">We may share your information only in the following circumstances:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>With your designated beneficiaries, as configured by you</li>
                <li>With service providers who perform services on our behalf (e.g., payment processing, email delivery, SMS messaging)</li>
                <li>To comply with applicable laws, regulations, or legal processes</li>
                <li>To protect the rights, property, and safety of CarryOn&trade;, our users, or others</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-[#F1F3F8] mb-3">7. Data Retention</h2>
              <p>
                We retain your personal information for as long as your account is active or as needed to provide you with our services. You may request deletion of your account and associated data by contacting us.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-[#F1F3F8] mb-3">8. Your Rights</h2>
              <p className="mb-3">Depending on your jurisdiction, you may have the right to:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Access, correct, or delete your personal data</li>
                <li>Object to or restrict processing of your data</li>
                <li>Data portability</li>
                <li>Withdraw consent at any time</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-[#F1F3F8] mb-3">9. Changes to This Policy</h2>
              <p>
                We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new policy on this page and updating the &quot;Last updated&quot; date.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-[#F1F3F8] mb-3">10. Contact Us</h2>
              <p>
                If you have questions about this Privacy Policy or our data practices, please contact us at: <a href="mailto:support@carryon.com" className="text-[#7AABFD] hover:text-[#A5C6FE] transition-colors">support@carryon.com</a>
              </p>
            </section>
          </div>
        </div>

        <div className="mt-6 text-center space-x-4">
          <Link to="/terms" className="text-[#7AABFD] text-sm hover:text-[#A5C6FE] transition-colors" data-testid="privacy-to-terms-link">Terms of Service</Link>
          <span className="text-[#525C72]">&middot;</span>
          <Link to="/login" className="text-[#7AABFD] text-sm hover:text-[#A5C6FE] transition-colors">Sign In</Link>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicyPage;

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { FileText, Upload, Shield, ChevronLeft, CheckCircle2, AlertTriangle, Loader2, Lock } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const UploadCertificatePage = () => {
  const { getAuthHeaders } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const steps = ['Before You Begin', 'Upload Document', 'Confirm & Submit'];

  const handleFileSelect = (e) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  };

  const handleSubmit = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const estateId = localStorage.getItem('beneficiary_estate_id');
      const formData = new FormData();
      formData.append('file', file);
      formData.append('estate_id', estateId);
      await axios.post(`${API_URL}/transition/upload-certificate?estate_id=${estateId}`, formData, {
        ...getAuthHeaders(),
        headers: { ...getAuthHeaders().headers, 'Content-Type': 'multipart/form-data' },
      });
      // toast removed
      navigate('/beneficiary/condolence');
    } catch (err) {
      console.error(err);
      toast.error('Failed to upload certificate');
    } finally { setUploading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-5 animate-fade-in"
      style={{ background: 'radial-gradient(ellipse at 30% 20%, rgba(37,99,235,0.08), transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(139,92,246,0.05), transparent 50%), linear-gradient(145deg, #0B1120, #0F1629 40%, #0A1628)' }}
      data-testid="upload-certificate">
      <div className="w-full max-w-xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, rgba(37,99,235,0.15), rgba(139,92,246,0.1))', border: '1px solid rgba(96,165,250,0.2)' }}>
            <Shield className="w-5 h-5 text-[#60A5FA]" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }}>Transition Verification</h1>
            <p className="text-xs text-[var(--t5)]">Death Certificate Upload</p>
          </div>
        </div>

        {/* Progress Steps */}
        <div className="flex gap-2 mb-8">
          {steps.map((s, i) => (
            <div key={i} className="flex-1">
              <div className="h-1.5 rounded-full mb-2 transition-all duration-500"
                style={{
                  background: i < step ? '#22C993' : i === step ? 'linear-gradient(90deg, #2563EB, #7C3AED)' : 'var(--b)',
                  boxShadow: i === step ? '0 0 12px rgba(37,99,235,0.3)' : 'none',
                }} />
              <p className="text-[10px] text-center transition-colors duration-300"
                style={{ color: i <= step ? '#93C5FD' : 'var(--t5)', fontWeight: i === step ? 700 : 400 }}>
                {s}
              </p>
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="rounded-2xl p-7 transition-all duration-300"
          style={{
            background: 'linear-gradient(168deg, rgba(26,36,64,0.6), rgba(15,22,41,0.8))',
            border: '1px solid rgba(96,165,250,0.1)',
            boxShadow: '0 16px 48px -12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.03)',
          }}>

          {/* Step 0: Before You Begin */}
          {step === 0 && (<>
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6"
              style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.12), rgba(139,92,246,0.08))', border: '1px solid rgba(96,165,250,0.15)' }}>
              <FileText className="w-8 h-8 text-[#60A5FA]" />
            </div>
            <h2 className="text-xl font-bold text-center text-[var(--t)] mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>Before You Begin</h2>
            <p className="text-sm text-[var(--t4)] text-center leading-relaxed mb-7">
              To verify a transition and unlock access to your benefactor's legacy, we need an official copy of their death certificate.
            </p>

            <div className="rounded-xl p-5 mb-5" style={{ background: 'rgba(37,99,235,0.04)', border: '1px solid rgba(37,99,235,0.1)' }}>
              <div className="text-xs font-bold text-[#93C5FD] uppercase tracking-wider mb-3">Requirements</div>
              {['An official or certified copy of the death certificate', 'The document must be legible and complete', 'Accepted formats: PDF, JPG, PNG, HEIC', 'Maximum file size: 25MB'].map((r, i) => (
                <div key={i} className="flex items-center gap-2.5 py-1.5">
                  <CheckCircle2 className="w-4 h-4 text-[#22C993] flex-shrink-0" />
                  <span className="text-sm text-[var(--t3)]">{r}</span>
                </div>
              ))}
            </div>

            <div className="rounded-xl p-4 mb-7 flex items-start gap-3" style={{ background: 'rgba(139,92,246,0.04)', border: '1px solid rgba(139,92,246,0.1)' }}>
              <Lock className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
              <p className="text-xs text-purple-300/80 leading-relaxed">
                Your upload is encrypted end-to-end with AES-256 and stored securely. It will only be reviewed by our Transition Verification Team and is never shared with third parties.
              </p>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="border-[var(--b)] text-[var(--t4)] hover:text-[var(--t)]" onClick={() => navigate('/beneficiary/pre')}>
                <ChevronLeft className="w-4 h-4 mr-1" /> Back
              </Button>
              <Button className="flex-1 justify-center text-sm font-bold" onClick={() => setStep(1)}
                style={{ background: 'linear-gradient(135deg, #2563EB, #7C3AED)', color: 'white', boxShadow: '0 4px 20px rgba(37,99,235,0.3)' }}>
                I'm Ready to Proceed
              </Button>
            </div>
          </>)}

          {/* Step 1: Upload */}
          {step === 1 && (<>
            <h2 className="text-xl font-bold text-center text-[var(--t)] mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>Upload Death Certificate</h2>
            <p className="text-sm text-[var(--t5)] text-center mb-7">Drag and drop or click to select your file</p>

            {!file ? (
              <label className="block cursor-pointer">
                <div className="rounded-2xl p-14 text-center transition-all duration-300 hover:border-[#60A5FA]/50 group"
                  style={{ border: '2px dashed rgba(96,165,250,0.2)', background: 'rgba(37,99,235,0.02)' }}>
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 transition-transform duration-300 group-hover:scale-110"
                    style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.1), rgba(139,92,246,0.08))', border: '1px solid rgba(96,165,250,0.15)' }}>
                    <Upload className="w-7 h-7 text-[#60A5FA]" />
                  </div>
                  <div className="text-sm font-bold text-[#93C5FD] mb-1">Drop file here or click to browse</div>
                  <div className="text-xs text-[var(--t5)]">PDF, JPG, PNG, HEIC · Max 25MB</div>
                </div>
                <input type="file" accept=".pdf,.jpg,.jpeg,.png,.heic" onChange={handleFileSelect} className="hidden" data-testid="cert-file-input" />
              </label>
            ) : (
              <div className="rounded-xl p-6 text-center" style={{ background: 'rgba(34,201,147,0.04)', border: '1px solid rgba(34,201,147,0.12)' }}>
                <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                  style={{ background: 'rgba(34,201,147,0.1)', border: '1px solid rgba(34,201,147,0.2)' }}>
                  <CheckCircle2 className="w-7 h-7 text-[#22C993]" />
                </div>
                <div className="text-sm font-bold text-[#22C993] mb-1">Document Selected</div>
                <div className="text-sm text-[var(--t3)]">{file.name}</div>
                <div className="text-xs text-[var(--t5)] mt-1">{(file.size / 1024 / 1024).toFixed(1)} MB · AES-256 Encrypted</div>
                <button onClick={() => setFile(null)} className="mt-4 text-xs text-[#60A5FA] font-bold hover:text-[#93C5FD] transition-colors">
                  Change File
                </button>
              </div>
            )}

            <div className="flex gap-3 mt-7">
              <Button variant="outline" className="border-[var(--b)] text-[var(--t4)] hover:text-[var(--t)]" onClick={() => setStep(0)}>
                <ChevronLeft className="w-4 h-4 mr-1" /> Back
              </Button>
              {file && (
                <Button className="flex-1 justify-center text-sm font-bold" onClick={() => setStep(2)}
                  style={{ background: 'linear-gradient(135deg, #2563EB, #7C3AED)', color: 'white', boxShadow: '0 4px 20px rgba(37,99,235,0.3)' }}>
                  Continue
                </Button>
              )}
            </div>
          </>)}

          {/* Step 2: Confirm & Submit */}
          {step === 2 && (<>
            <h2 className="text-xl font-bold text-center text-[var(--t)] mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>Confirm Submission</h2>
            <p className="text-sm text-[var(--t5)] text-center leading-relaxed mb-7">
              Please verify the details below before submitting for review.
            </p>

            <div className="rounded-xl overflow-hidden mb-5" style={{ border: '1px solid var(--b)' }}>
              {[
                ['Document', file?.name || 'Unknown'],
                ['File Size', file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : ''],
                ['Upload Method', 'Secure Upload'],
                ['Encryption', 'AES-256 End-to-End'],
              ].map(([k, v], i, a) => (
                <div key={k} className="flex justify-between px-5 py-3 text-sm"
                  style={{ background: i % 2 === 0 ? 'rgba(37,99,235,0.02)' : 'transparent', borderBottom: i < a.length - 1 ? '1px solid var(--b)' : 'none' }}>
                  <span className="text-[var(--t4)]">{k}</span>
                  <span className="text-[var(--t)] font-bold">{v}</span>
                </div>
              ))}
            </div>

            <div className="rounded-xl p-4 mb-7 flex items-start gap-3" style={{ background: 'rgba(245,158,11,0.04)', border: '1px solid rgba(245,158,11,0.1)' }}>
              <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-300/80 leading-relaxed">
                By submitting, you confirm this is an authentic, official death certificate. Fraudulent submissions may result in account termination and legal action.
              </p>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="border-[var(--b)] text-[var(--t4)] hover:text-[var(--t)]" onClick={() => setStep(1)}>
                <ChevronLeft className="w-4 h-4 mr-1" /> Back
              </Button>
              <Button
                className="flex-1 justify-center text-sm font-bold"
                style={{ background: 'linear-gradient(135deg, #2563EB, #7C3AED)', color: 'white', boxShadow: '0 4px 20px rgba(37,99,235,0.3)' }}
                onClick={handleSubmit}
                disabled={uploading}
              >
                {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Shield className="w-4 h-4 mr-2" />}
                Submit for Verification
              </Button>
            </div>
          </>)}
        </div>
      </div>
    </div>
  );
};

export default UploadCertificatePage;

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { FileText, Upload, Shield, ChevronLeft, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
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
      toast.success('Death certificate submitted for review');
      navigate('/beneficiary/condolence');
    } catch (err) {
      console.error(err);
      toast.error('Failed to upload certificate');
    } finally { setUploading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-5 animate-fade-in" style={{ background: 'linear-gradient(145deg, #0B1120, #0F1629 40%, #0A1628)' }} data-testid="upload-certificate">
      <div className="w-full max-w-xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-7">
          <img src="/carryon-app-icon.jpg" alt="CarryOn" className="w-9 h-9 rounded-lg" />
          <div>
            <div className="text-lg font-bold text-[var(--t)]">Transition Verification</div>
            <div className="text-sm text-[var(--t5)]">Death Certificate Upload</div>
          </div>
        </div>

        {/* Progress */}
        <div className="flex gap-1 mb-7">
          {steps.map((s, i) => (
            <div key={i} className="flex-1">
              <div className="h-1 rounded-full mb-1" style={{ background: i <= step ? 'linear-gradient(90deg, #2563EB, #3B82F6)' : 'var(--b)' }} />
              <div className="text-xs text-center" style={{ color: i <= step ? '#7AABFD' : 'var(--t5)', fontWeight: i === step ? 700 : 400 }}>{s}</div>
            </div>
          ))}
        </div>

        <div className="rounded-2xl p-8" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
          {/* Step 0: Before You Begin */}
          {step === 0 && (<>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5" style={{ background: 'rgba(59,130,246,0.1)' }}>
              <FileText className="w-7 h-7 text-[#60A5FA]" />
            </div>
            <h2 className="text-xl font-bold text-center text-[var(--t)] mb-2">Before You Begin</h2>
            <p className="text-sm text-[var(--t3)] text-center leading-relaxed mb-6">
              To verify a transition and unlock access to your benefactor's legacy, we need an official copy of their death certificate.
            </p>

            <div className="rounded-xl p-4 mb-5" style={{ background: 'rgba(37,99,235,0.05)', border: '1px solid rgba(37,99,235,0.12)' }}>
              <div className="text-sm font-bold text-[#7AABFD] mb-3">You will need:</div>
              {['An official or certified copy of the death certificate', 'The document must be legible and complete', 'Accepted formats: PDF, JPG, PNG, HEIC', 'Maximum file size: 25MB'].map((r, i) => (
                <div key={i} className="flex items-center gap-2 py-1">
                  <CheckCircle2 className="w-4 h-4 text-[#60A5FA] flex-shrink-0" />
                  <span className="text-sm text-[var(--t2)]">{r}</span>
                </div>
              ))}
            </div>

            <div className="rounded-xl p-4 mb-6" style={{ background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.12)' }}>
              <p className="text-sm text-[var(--pr2)] leading-relaxed">
                Your upload is encrypted end-to-end and will only be reviewed by our certified Transition Verification Team. It is never stored on public servers or shared with third parties.
              </p>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="border-[var(--b)] text-[var(--t3)]" onClick={() => navigate('/beneficiary/pre')}>
                <ChevronLeft className="w-4 h-4 mr-1" /> Back
              </Button>
              <Button className="flex-1 justify-center" style={{ background: 'linear-gradient(135deg, #3B7BF7, #2B6AE6)', color: 'white' }} onClick={() => setStep(1)}>
                I'm Ready to Proceed
              </Button>
            </div>
          </>)}

          {/* Step 1: Upload */}
          {step === 1 && (<>
            <h2 className="text-xl font-bold text-center text-[var(--t)] mb-2">Upload Death Certificate</h2>
            <p className="text-sm text-[var(--t4)] text-center mb-6">Drag and drop or click to select your file</p>

            {!file ? (
              <label className="block cursor-pointer">
                <div className="rounded-2xl p-12 text-center transition-all hover:border-[#60A5FA]/50" style={{ border: '2px dashed rgba(96,165,250,0.3)', background: 'rgba(37,99,235,0.03)' }}>
                  <Upload className="w-9 h-9 text-[#60A5FA] mx-auto mb-3" />
                  <div className="text-sm font-bold text-[#7AABFD] mb-1">Drop file here or click to browse</div>
                  <div className="text-xs text-[var(--t5)]">PDF, JPG, PNG, HEIC · Max 25MB</div>
                </div>
                <input type="file" accept=".pdf,.jpg,.jpeg,.png,.heic" onChange={handleFileSelect} className="hidden" data-testid="cert-file-input" />
              </label>
            ) : (
              <div className="rounded-xl p-5 text-center" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)' }}>
                <div className="w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center" style={{ background: 'var(--gnbg)' }}>
                  <CheckCircle2 className="w-6 h-6 text-[var(--gn2)]" />
                </div>
                <div className="text-sm font-bold text-[var(--gn2)] mb-1">Document Selected</div>
                <div className="text-sm text-[var(--t2)]">{file.name}</div>
                <div className="text-xs text-[var(--t4)]">{(file.size / 1024 / 1024).toFixed(1)} MB · Encrypted</div>
                <button onClick={() => setFile(null)} className="mt-3 text-xs text-[var(--bl3)] font-bold">
                  Change File
                </button>
              </div>
            )}

            <div className="flex gap-3 mt-6">
              <Button variant="outline" className="border-[var(--b)] text-[var(--t3)]" onClick={() => setStep(0)}>
                <ChevronLeft className="w-4 h-4 mr-1" /> Back
              </Button>
              {file && (
                <Button className="flex-1 justify-center" style={{ background: 'linear-gradient(135deg, #3B7BF7, #2B6AE6)', color: 'white' }} onClick={() => setStep(2)}>
                  Continue
                </Button>
              )}
            </div>
          </>)}

          {/* Step 2: Confirm & Submit */}
          {step === 2 && (<>
            <h2 className="text-xl font-bold text-center text-[var(--t)] mb-2">Confirm Submission</h2>
            <p className="text-sm text-[var(--t4)] text-center leading-relaxed mb-6">
              Please verify the details below before submitting for review.
            </p>

            <div className="rounded-xl p-4 mb-5" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
              {[
                ['Document', file?.name || 'Unknown'],
                ['File Size', file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : ''],
                ['Upload Method', 'PDF Upload'],
                ['Encryption', 'AES-256 – End-to-End'],
              ].map(([k, v], i, a) => (
                <div key={k} className="flex justify-between py-2 text-sm" style={{ borderBottom: i < a.length - 1 ? '1px solid var(--b)' : 'none' }}>
                  <span className="text-[var(--t3)]">{k}</span>
                  <span className="text-[var(--t)] font-bold">{v}</span>
                </div>
              ))}
            </div>

            <div className="rounded-xl p-4 mb-6" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.12)' }}>
              <p className="text-sm text-[var(--yw)] leading-relaxed flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                By submitting, you confirm this is an authentic, official death certificate. Fraudulent submissions may result in account termination and legal action.
              </p>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="border-[var(--b)] text-[var(--t3)]" onClick={() => setStep(1)}>
                <ChevronLeft className="w-4 h-4 mr-1" /> Back
              </Button>
              <Button
                className="flex-1 justify-center"
                style={{ background: 'linear-gradient(135deg, #3B7BF7, #2B6AE6)', color: 'white' }}
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

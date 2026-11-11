import React, { useState } from 'react';
import {
  UserCheck,
  Save,
  ShieldCheck,
  Sparkles,
  RotateCcw,
  MapPin,
  Mail,
  Briefcase,
  User,
} from 'lucide-react';
import { UserProfile } from '../../shared/types';

interface ProfileVaultProps {
  initialProfile: UserProfile;
  onSaveProfile: (profile: UserProfile) => Promise<void>;
}

const SAMPLE_PROFILE: UserProfile = {
  fullName: 'Aarav Sharma',
  firstName: 'Aarav',
  lastName: 'Sharma',
  email: 'aarav.sharma@example.com',
  phone: '+91 9876543210',
  city: 'Bengaluru',
  state: 'Karnataka',
  country: 'India',
  postalCode: '560001',
  linkedInUrl: 'https://linkedin.com/in/aaravsharma',
  githubUrl: 'https://github.com/aaravsharma',
  bio: 'Software engineer passionate about AI agents, cloud architectures, and open web accessibility.',
};

const EMPTY_PROFILE: UserProfile = {
  fullName: '',
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  city: '',
  state: '',
  country: '',
  postalCode: '',
  linkedInUrl: '',
  githubUrl: '',
  bio: '',
};

export const ProfileVault: React.FC<ProfileVaultProps> = ({
  initialProfile,
  onSaveProfile,
}) => {
  const [profile, setProfile] = useState<UserProfile>(initialProfile || EMPTY_PROFILE);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleChange = (field: keyof UserProfile, value: string) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    await onSaveProfile(profile);
    setIsSaving(false);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handleLoadSample = () => {
    setProfile(SAMPLE_PROFILE);
  };

  const handleClearAll = () => {
    setProfile(EMPTY_PROFILE);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-900 text-slate-100">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-sky-950/60 border border-sky-800/60 flex items-center justify-center text-sky-400">
            <UserCheck className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-100">Local Profile Vault</h2>
            <p className="text-[11px] text-slate-400">
              Stored locally on your device for smart 1-click form autofill.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleLoadSample}
            title="Populate realistic sample data to test form filling"
            className="px-2 py-1 text-[11px] font-medium rounded bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 hover:border-sky-500/50 transition flex items-center gap-1"
          >
            <Sparkles className="w-3 h-3 text-sky-400" />
            <span>Sample</span>
          </button>
          <button
            type="button"
            onClick={handleClearAll}
            title="Clear all fields"
            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-rose-400 border border-slate-700 transition"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Privacy Guarantee Banner */}
      <div className="p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-500/30 flex items-start gap-2 text-[11px] text-emerald-200 leading-relaxed">
        <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
        <span>
          <strong>100% Local & Private:</strong> Credentials, passwords, OTPs, and credit cards are strictly blocked and never stored here.
        </span>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        {/* Section 1: Personal Details */}
        <div className="space-y-2">
          <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            <User className="w-3.5 h-3.5 text-sky-400" />
            <span>Personal Identity</span>
          </div>

          <div>
            <label className="text-[11px] font-medium text-slate-300 block mb-1">
              Full Name
            </label>
            <input
              type="text"
              value={profile.fullName || ''}
              onChange={(e) => handleChange('fullName', e.target.value)}
              className="input-field py-1.5 text-xs w-full"
              placeholder="e.g. Aarav Sharma"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-medium text-slate-300 block mb-1">
                First Name
              </label>
              <input
                type="text"
                value={profile.firstName || ''}
                onChange={(e) => handleChange('firstName', e.target.value)}
                className="input-field py-1.5 text-xs w-full"
                placeholder="e.g. Aarav"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-slate-300 block mb-1">
                Last Name
              </label>
              <input
                type="text"
                value={profile.lastName || ''}
                onChange={(e) => handleChange('lastName', e.target.value)}
                className="input-field py-1.5 text-xs w-full"
                placeholder="e.g. Sharma"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Contact Information */}
        <div className="space-y-2 pt-1 border-t border-slate-800">
          <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            <Mail className="w-3.5 h-3.5 text-sky-400" />
            <span>Contact Information</span>
          </div>

          <div>
            <label className="text-[11px] font-medium text-slate-300 block mb-1">
              Email Address
            </label>
            <input
              type="email"
              value={profile.email || ''}
              onChange={(e) => handleChange('email', e.target.value)}
              className="input-field py-1.5 text-xs w-full"
              placeholder="e.g. aarav@example.com"
            />
          </div>

          <div>
            <label className="text-[11px] font-medium text-slate-300 block mb-1">
              Phone Number
            </label>
            <input
              type="tel"
              value={profile.phone || ''}
              onChange={(e) => handleChange('phone', e.target.value)}
              className="input-field py-1.5 text-xs w-full"
              placeholder="e.g. +91 9876543210"
            />
          </div>
        </div>

        {/* Section 3: Location */}
        <div className="space-y-2 pt-1 border-t border-slate-800">
          <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            <MapPin className="w-3.5 h-3.5 text-sky-400" />
            <span>Location & Address</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-medium text-slate-300 block mb-1">
                City
              </label>
              <input
                type="text"
                value={profile.city || ''}
                onChange={(e) => handleChange('city', e.target.value)}
                className="input-field py-1.5 text-xs w-full"
                placeholder="e.g. Bengaluru"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-slate-300 block mb-1">
                State / Province
              </label>
              <input
                type="text"
                value={profile.state || ''}
                onChange={(e) => handleChange('state', e.target.value)}
                className="input-field py-1.5 text-xs w-full"
                placeholder="e.g. Karnataka"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-medium text-slate-300 block mb-1">
                Country
              </label>
              <input
                type="text"
                value={profile.country || ''}
                onChange={(e) => handleChange('country', e.target.value)}
                className="input-field py-1.5 text-xs w-full"
                placeholder="e.g. India"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-slate-300 block mb-1">
                Postal / Zip Code
              </label>
              <input
                type="text"
                value={profile.postalCode || ''}
                onChange={(e) => handleChange('postalCode', e.target.value)}
                className="input-field py-1.5 text-xs w-full"
                placeholder="e.g. 560001"
              />
            </div>
          </div>
        </div>

        {/* Section 4: Professional & Social */}
        <div className="space-y-2 pt-1 border-t border-slate-800">
          <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            <Briefcase className="w-3.5 h-3.5 text-sky-400" />
            <span>Professional & Web Profiles</span>
          </div>

          <div>
            <label className="text-[11px] font-medium text-slate-300 block mb-1">
              LinkedIn URL
            </label>
            <input
              type="url"
              value={profile.linkedInUrl || ''}
              onChange={(e) => handleChange('linkedInUrl', e.target.value)}
              className="input-field py-1.5 text-xs w-full"
              placeholder="https://linkedin.com/in/username"
            />
          </div>

          <div>
            <label className="text-[11px] font-medium text-slate-300 block mb-1">
              GitHub URL / Username
            </label>
            <input
              type="url"
              value={profile.githubUrl || ''}
              onChange={(e) => handleChange('githubUrl', e.target.value)}
              className="input-field py-1.5 text-xs w-full"
              placeholder="https://github.com/username"
            />
          </div>

          <div>
            <label className="text-[11px] font-medium text-slate-300 block mb-1">
              Bio / Professional Summary
            </label>
            <textarea
              value={profile.bio || ''}
              onChange={(e) => handleChange('bio', e.target.value)}
              rows={3}
              className="input-field py-1.5 text-xs w-full resize-none leading-relaxed"
              placeholder="Short summary for job applications, bios, and registration forms..."
            />
          </div>
        </div>

        {/* Submit & Status */}
        <div className="pt-2 flex items-center justify-between border-t border-slate-800">
          <button
            type="submit"
            disabled={isSaving}
            className="btn-primary text-xs py-2 px-4 shadow-md flex items-center gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSaving ? 'Saving...' : 'Save Profile'}</span>
          </button>

          {savedSuccess && (
            <span className="text-xs font-semibold text-emerald-400 animate-fade-in flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Saved locally in Chrome!</span>
            </span>
          )}
        </div>
      </form>
    </div>
  );
};

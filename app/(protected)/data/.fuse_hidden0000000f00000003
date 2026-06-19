"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Header } from "@/components/header";
import { DataSidebar } from "@/components/data/data-sidebar";
import { BiomarkersSummary } from "@/components/data/biomarkers-summary";
import { BiomarkersList } from "@/components/data/biomarkers-list";
import { VitalsDashboard } from "@/components/data/vitals-dashboard";
import { Timeline } from "@/components/home/timeline";
import { AddBiomarkerDialog } from "@/components/data/add-biomarker-dialog";
import { EditConditionDialog } from "@/components/data/edit-condition-dialog";
import { EditMedicationDialog } from "@/components/data/edit-medication-dialog";
import { DocumentsTab } from "@/components/data/documents-tab";
import { ConnectedServicesTab } from "@/components/data/connected-services-tab";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/components/AuthContext";

const tabs = [
  { id: "healthProfile", label: "Health Profile" },
  { id: "vitals", label: "Vitals" },
  { id: "labResults", label: "Lab Results" },
  { id: "connectedServices", label: "Connected Services" },
  { id: "documents", label: "Documents" },
  { id: "activity", label: "All Activity" },
] as const;

type TabId = (typeof tabs)[number]["id"];

interface Condition {
  id: string;
  name: string;
  icd_10_code?: string;
  status?: string;
  diagnosed_date?: string;
  resolved_date?: string;
  severity?: string;
  notes?: string;
}

interface Medication {
  id: string;
  name: string;
  generic_name?: string;
  dosage?: string;
  frequency?: string;
  route?: string;
  status?: string;
  start_date?: string;
  end_date?: string;
  prescribing_doctor?: string;
  pharmacy?: string;
  notes?: string;
}

// Helper: total inches → "5'10\"" display
function formatHeight(inches: number | null): string {
  if (!inches) return '';
  const ft = Math.floor(inches / 12);
  const ins = Math.round(inches % 12);
  return `${ft}'${ins}"`;
}

// BMI from lbs + total inches
function calcBMI(weightLbs: number, heightInches: number): number | null {
  if (!weightLbs || !heightInches) return null;
  return Math.round((weightLbs / (heightInches * heightInches)) * 703 * 10) / 10;
}

function HealthProfileView({ isEditing, setIsEditing }: { isEditing: boolean; setIsEditing: (val: boolean) => void }) {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    fullName: "",
    gender: "",
    email: "",
    dob: "",          // display string e.g. "March 14, 1985"
    dobRaw: "",       // ISO date for input[type=date] e.g. "1985-03-14"
    phone: "",
    heightInches: "", // total inches e.g. "70"
    weightLbs: "",
    bloodType: "",
    insuranceProvider: "",
    insurancePolicyNumber: "",
    insuranceGroupNumber: "",
  });

  const [conditions, setConditions] = useState<Condition[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [editingCondition, setEditingCondition] = useState<Condition | null>(null);
  const [editingMedication, setEditingMedication] = useState<Medication | null>(null);
  const [showConditionDialog, setShowConditionDialog] = useState(false);
  const [showMedicationDialog, setShowMedicationDialog] = useState(false);

  useEffect(() => {
    if (user) fetchAll();
  }, [user]);

  const fetchAll = async () => {
    if (!user) return;

    try {
      const [profileRes, conditionsRes, medsRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('full_name, email, date_of_birth, gender, height_inches, weight_lbs, blood_type, phone, insurance_provider, insurance_policy_number, insurance_group_number')
          .eq('id', user.id)
          .single(),
        supabase.from('conditions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('medications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      ]);

      if (profileRes.data) {
        const p = profileRes.data;
        const dobRaw = p.date_of_birth || '';
        const dobDisplay = p.date_of_birth
          ? new Date(p.date_of_birth + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
          : '';
        setFormData({
          fullName: p.full_name || '',
          email: p.email || user.email || '',
          gender: p.gender || '',
          dob: dobDisplay,
          dobRaw,
          phone: p.phone || '',
          heightInches: p.height_inches ? String(p.height_inches) : '',
          weightLbs: p.weight_lbs ? String(p.weight_lbs) : '',
          bloodType: p.blood_type || '',
          insuranceProvider: p.insurance_provider || '',
          insurancePolicyNumber: p.insurance_policy_number || '',
          insuranceGroupNumber: p.insurance_group_number || '',
        });
      } else {
        setFormData(prev => ({ ...prev, email: user.email || '' }));
      }

      if (conditionsRes.data) setConditions(conditionsRes.data);
      if (medsRes.data) setMedications(medsRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchConditionsAndMedications = fetchAll;

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const heightInchesNum = formData.heightInches ? parseFloat(formData.heightInches) : null;
      const weightLbsNum = formData.weightLbs ? parseFloat(formData.weightLbs) : null;
      await supabase.from('profiles').upsert({
        id: user.id,
        full_name: formData.fullName || null,
        email: formData.email || null,
        gender: formData.gender || null,
        date_of_birth: formData.dobRaw || null,
        phone: formData.phone || null,
        height_inches: heightInchesNum,
        height_cm: heightInchesNum ? Math.round(heightInchesNum * 2.54) : null,
        weight_lbs: weightLbsNum,
        blood_type: formData.bloodType || null,
        insurance_provider: formData.insuranceProvider || null,
        insurance_policy_number: formData.insurancePolicyNumber || null,
        insurance_group_number: formData.insuranceGroupNumber || null,
        updated_at: new Date().toISOString(),
      });
      // Refresh displayed DOB
      if (formData.dobRaw) {
        const dobDisplay = new Date(formData.dobRaw + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        setFormData(prev => ({ ...prev, dob: dobDisplay }));
      }
    } catch (err) {
      console.error('Profile save error:', err);
    } finally {
      setSaving(false);
    }
    setIsEditing(false);
  };

  // Computed BMI
  const bmi = formData.heightInches && formData.weightLbs
    ? calcBMI(parseFloat(formData.weightLbs), parseFloat(formData.heightInches))
    : null;

  const removeCondition = async (id: string) => {
    try {
      const { error } = await supabase.from('conditions').delete().eq('id', id);
      if (error) throw error;
      setConditions(conditions.filter(c => c.id !== id));
    } catch (error) {
      console.error('Error removing condition:', error);
    }
  };

  const removeMedication = async (id: string) => {
    try {
      const { error } = await supabase.from('medications').delete().eq('id', id);
      if (error) throw error;
      setMedications(medications.filter(m => m.id !== id));
    } catch (error) {
      console.error('Error removing medication:', error);
    }
  };

  const openAddCondition = () => {
    setEditingCondition(null);
    setShowConditionDialog(true);
  };

  const openEditCondition = (condition: Condition) => {
    setEditingCondition(condition);
    setShowConditionDialog(true);
  };

  const openAddMedication = () => {
    setEditingMedication(null);
    setShowMedicationDialog(true);
  };

  const openEditMedication = (medication: Medication) => {
    setEditingMedication(medication);
    setShowMedicationDialog(true);
  };

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Loading...</div>;
  }

  const inField = (val: string, onChange: (v: string) => void, type = "text", placeholder = "") => (
    <input
      type={type}
      value={val}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-background border border-cyan-500/20 rounded px-3 py-2 text-foreground text-sm"
    />
  );

  return (
    <div className="space-y-6">
      {/* ── Personal Information ── */}
      <div className="glass rounded-2xl p-5 border border-cyan-500/20">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-foreground">Personal Information</h2>
          <span className="text-xs text-muted-foreground">Your profile</span>
        </div>

        <div className="grid gap-5 md:grid-cols-2 text-sm">
          <div className="space-y-4">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Full Name</p>
              {isEditing
                ? inField(formData.fullName, (v) => setFormData({ ...formData, fullName: v }), "text", "Your full name")
                : <p className="text-foreground font-medium">{formData.fullName || <span className="text-muted-foreground italic">Not set</span>}</p>}
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Gender</p>
              {isEditing ? (
                <select
                  value={formData.gender}
                  onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                  className="w-full bg-background border border-cyan-500/20 rounded px-3 py-2 text-foreground text-sm"
                >
                  <option value="">Select</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                  <option value="prefer_not_to_say">Prefer not to say</option>
                </select>
              ) : (
                <p className="text-foreground capitalize">{formData.gender?.replace(/_/g, ' ') || <span className="text-muted-foreground italic">Not set</span>}</p>
              )}
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Email</p>
              <p className="text-foreground">{formData.email}</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Date of Birth</p>
              {isEditing ? (
                <input
                  type="date"
                  value={formData.dobRaw}
                  onChange={(e) => setFormData({ ...formData, dobRaw: e.target.value })}
                  className="w-full bg-background border border-cyan-500/20 rounded px-3 py-2 text-foreground text-sm"
                />
              ) : (
                <p className="text-foreground">{formData.dob || <span className="text-muted-foreground italic">Not set</span>}</p>
              )}
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Phone</p>
              {isEditing
                ? inField(formData.phone, (v) => setFormData({ ...formData, phone: v }), "tel", "+1 (555) 000-0000")
                : <p className="text-foreground">{formData.phone || <span className="text-muted-foreground italic">Not set</span>}</p>}
            </div>
          </div>
        </div>

        {isEditing && (
          <div className="mt-5 flex gap-2">
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-cyan-500 text-white rounded hover:bg-cyan-600 text-sm disabled:opacity-50">
              {saving ? "Saving…" : "Save Changes"}
            </button>
            <button onClick={() => setIsEditing(false)} className="px-4 py-2 bg-secondary text-foreground rounded hover:bg-secondary/80 text-sm">
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* ── Biometrics ── */}
      <div className="glass rounded-2xl p-5 border border-cyan-500/20">
        <h2 className="text-sm font-semibold text-foreground mb-4">Biometrics</h2>
        <div className="grid gap-4 sm:grid-cols-4">
          <div className="glass rounded-xl px-4 py-3 border border-cyan-500/10">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Height</p>
            {isEditing ? (
              <input
                type="number"
                value={formData.heightInches}
                onChange={(e) => setFormData({ ...formData, heightInches: e.target.value })}
                placeholder="70"
                className="w-full bg-background border border-cyan-500/20 rounded px-2 py-1 text-lg font-semibold text-foreground"
              />
            ) : (
              <p className="text-2xl font-semibold text-foreground">
                {formData.heightInches ? formatHeight(parseFloat(formData.heightInches)) : <span className="text-base text-muted-foreground">—</span>}
              </p>
            )}
            {isEditing && <p className="text-[10px] text-muted-foreground mt-1">total inches (e.g. 70 = 5&apos;10&quot;)</p>}
          </div>
          <div className="glass rounded-xl px-4 py-3 border border-cyan-500/10">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Weight (lbs)</p>
            {isEditing ? (
              <input
                type="number"
                value={formData.weightLbs}
                onChange={(e) => setFormData({ ...formData, weightLbs: e.target.value })}
                placeholder="160"
                className="w-full bg-background border border-cyan-500/20 rounded px-2 py-1 text-lg font-semibold text-foreground"
              />
            ) : (
              <p className="text-2xl font-semibold text-foreground">
                {formData.weightLbs ? `${formData.weightLbs}` : <span className="text-base text-muted-foreground">—</span>}
              </p>
            )}
          </div>
          <div className="glass rounded-xl px-4 py-3 border border-cyan-500/10">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">BMI</p>
            <p className={`text-2xl font-semibold ${bmi ? (bmi < 18.5 ? 'text-yellow-400' : bmi < 25 ? 'text-emerald-400' : bmi < 30 ? 'text-yellow-400' : 'text-red-400') : 'text-muted-foreground'}`}>
              {bmi ?? '—'}
            </p>
            {bmi && <p className="text-[10px] text-muted-foreground mt-1">{bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal' : bmi < 30 ? 'Overweight' : 'Obese'}</p>}
          </div>
          <div className="glass rounded-xl px-4 py-3 border border-cyan-500/10">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Blood Type</p>
            {isEditing ? (
              <select
                value={formData.bloodType}
                onChange={(e) => setFormData({ ...formData, bloodType: e.target.value })}
                className="w-full bg-background border border-cyan-500/20 rounded px-2 py-1 text-sm font-semibold text-foreground"
              >
                <option value="">Unknown</option>
                {['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            ) : (
              <p className="text-2xl font-semibold text-foreground">{formData.bloodType || <span className="text-base text-muted-foreground">—</span>}</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Insurance ── */}
      <div className="glass rounded-2xl p-5 border border-cyan-500/20">
        <h2 className="text-sm font-semibold text-foreground mb-4">Insurance</h2>
        <div className="grid gap-4 sm:grid-cols-3 text-sm">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Insurance Provider</p>
            {isEditing
              ? inField(formData.insuranceProvider, (v) => setFormData({ ...formData, insuranceProvider: v }), "text", "e.g. BlueCross")
              : <p className="text-foreground">{formData.insuranceProvider || <span className="text-muted-foreground italic">Not set</span>}</p>}
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Policy Number</p>
            {isEditing
              ? inField(formData.insurancePolicyNumber, (v) => setFormData({ ...formData, insurancePolicyNumber: v }), "text", "XYZ123456")
              : <p className="text-foreground">{formData.insurancePolicyNumber || <span className="text-muted-foreground italic">Not set</span>}</p>}
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Group Number</p>
            {isEditing
              ? inField(formData.insuranceGroupNumber, (v) => setFormData({ ...formData, insuranceGroupNumber: v }), "text", "GRP001")
              : <p className="text-foreground">{formData.insuranceGroupNumber || <span className="text-muted-foreground italic">Not set</span>}</p>}
          </div>
        </div>
        {isEditing && (
          <div className="mt-4 flex gap-2">
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-cyan-500 text-white rounded hover:bg-cyan-600 text-sm disabled:opacity-50">
              {saving ? "Saving…" : "Save Changes"}
            </button>
            <button onClick={() => setIsEditing(false)} className="px-4 py-2 bg-secondary text-foreground rounded hover:bg-secondary/80 text-sm">
              Cancel
            </button>
          </div>
        )}
      </div>

      <div className="glass rounded-2xl p-5 border border-cyan-500/20">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground">Conditions</h2>
          <button
            onClick={openAddCondition}
            className="text-xs text-cyan-400 hover:text-cyan-300"
          >
            + Add Condition
          </button>
        </div>
        <div className="space-y-2">
          {conditions.map((condition) => (
            <div key={condition.id} className="flex items-center justify-between glass rounded-lg px-3 py-2 border border-cyan-500/10">
              <div className="flex-1 cursor-pointer" onClick={() => openEditCondition(condition)}>
                <span className="text-sm text-foreground">{condition.name}</span>
                {condition.diagnosed_date && (
                  <span className="text-xs text-muted-foreground ml-2">
                    • Diagnosed: {new Date(condition.diagnosed_date).toLocaleDateString()}
                  </span>
                )}
              </div>
              {isEditing && (
                <button
                  onClick={() => removeCondition(condition.id)}
                  className="text-pink-400 hover:text-pink-300 text-xs ml-2"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
          {conditions.length === 0 && (
            <p className="text-sm text-muted-foreground">No conditions on file.</p>
          )}
        </div>
      </div>

      <div className="glass rounded-2xl p-5 border border-cyan-500/20">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground">Medications</h2>
          <button
            onClick={openAddMedication}
            className="text-xs text-cyan-400 hover:text-cyan-300"
          >
            + Add Medication
          </button>
        </div>
        <div className="space-y-2">
          {medications.map((medication) => (
            <div key={medication.id} className="flex items-center justify-between glass rounded-lg px-3 py-2 border border-cyan-500/10">
              <div className="flex-1 cursor-pointer" onClick={() => openEditMedication(medication)}>
                <span className="text-sm text-foreground">{medication.name}</span>
                {(medication.dosage || medication.frequency) && (
                  <span className="text-xs text-muted-foreground ml-2">
                    • {medication.dosage} {medication.frequency && `- ${medication.frequency}`}
                  </span>
                )}
              </div>
              {isEditing && (
                <button
                  onClick={() => removeMedication(medication.id)}
                  className="text-pink-400 hover:text-pink-300 text-xs ml-2"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
          {medications.length === 0 && (
            <p className="text-sm text-muted-foreground">No medications on file.</p>
          )}
        </div>
      </div>

      {showConditionDialog && (
        <EditConditionDialog
          condition={editingCondition || undefined}
          onSuccess={fetchConditionsAndMedications}
          onClose={() => setShowConditionDialog(false)}
        />
      )}

      {showMedicationDialog && (
        <EditMedicationDialog
          medication={editingMedication || undefined}
          onSuccess={fetchConditionsAndMedications}
          onClose={() => setShowMedicationDialog(false)}
        />
      )}
    </div>
  );
}


// ── Visit Notes View ─────────────────────────────────────────────────────────
function VisitNotesView() {
  const { user } = useAuth()
  const [notes, setNotes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    if (user) loadNotes()
  }, [user])

  async function loadNotes() {
    if (!user) return
    setLoading(true)
    const { data } = await supabase
      .from("visit_notes")
      .select("id,title,transcript,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
    setNotes(data || [])
    setLoading(false)
  }

  async function deleteNote(id: string) {
    if (!confirm("Delete this visit note?")) return
    await supabase.from("visit_notes").delete().eq("id", id)
    setNotes(prev => prev.filter(n => n.id !== id))
  }

  if (loading) return null
  if (notes.length === 0) return null

  return (
    <div className="glass rounded-2xl border border-amber-500/20 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
        <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
        </svg>
        <h3 className="text-sm font-semibold text-foreground">Visit Notes</h3>
        <span className="text-xs text-muted-foreground/50 ml-1">{notes.length} note{notes.length !== 1 ? "s" : ""}</span>
      </div>
      <div className="divide-y divide-border/50">
        {notes.map(note => (
          <div key={note.id} className="px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{note.title}</p>
                <p className="text-xs text-muted-foreground/60 mt-0.5">
                  {new Date(note.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => setExpanded(expanded === note.id ? null : note.id)}
                  className="text-xs text-cyan-400/70 hover:text-cyan-400 transition-colors"
                >
                  {expanded === note.id ? "Hide" : "View"}
                </button>
                <button
                  onClick={() => deleteNote(note.id)}
                  className="text-xs text-muted-foreground/40 hover:text-red-400 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
            {expanded === note.id && note.transcript && (
              <div className="mt-3 p-3 rounded-lg bg-white/[0.03] border border-white/8">
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{note.transcript}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function DataPage() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab") as TabId | null;
  const [activeTab, setActiveTab] = useState<TabId>(tabParam && ["healthProfile","vitals","labResults","connectedServices","documents","activity"].includes(tabParam) ? tabParam : "healthProfile");
  const [categoryFilter, setCategoryFilter] = useState("All data");
  const [isEditing, setIsEditing] = useState(false);
  const [labRefreshKey, setLabRefreshKey] = useState(0);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">My Health</h1>
          </div>
          {activeTab === "healthProfile" && (
            <button
              onClick={() => setIsEditing(!isEditing)}
              className="text-sm text-cyan-400 hover:text-cyan-300"
            >
              {isEditing ? "Cancel" : "Edit Profile"}
            </button>
          )}
        </div>

        <div className="mb-6 flex items-center gap-2 overflow-x-auto border-b border-border pb-1">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`relative px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
                {isActive && (
                  <span className="absolute inset-x-1 -bottom-[3px] h-[2px] rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
                )}
              </button>
            );
          })}
        </div>

        {activeTab === "healthProfile" && <HealthProfileView isEditing={isEditing} setIsEditing={setIsEditing} />}

        {activeTab === "vitals" && (
          <div className="min-h-[calc(100vh-220px)]">
            <VitalsDashboard />
          </div>
        )}

        {activeTab === "labResults" && (
          <div className="flex gap-8">
            <DataSidebar selectedCategory={categoryFilter} onCategoryChange={setCategoryFilter} />
            <div className="flex-1">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-foreground">Lab Results</h2>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-muted-foreground">Add lab results manually or upload a PDF from Home</span>
                  <AddBiomarkerDialog onSuccess={() => setLabRefreshKey(k => k + 1)} />
                </div>
              </div>

              <BiomarkersSummary key={`bs-${labRefreshKey}`} />
              <BiomarkersList key={`bl-${labRefreshKey}`} categoryFilter={categoryFilter} />
            </div>
          </div>
        )}

        {activeTab === "connectedServices" && <ConnectedServicesTab />}

        {activeTab === "documents" && <DocumentsTab />}

        {activeTab === "activity" && (
          <div className="mt-2 space-y-6">
            <Timeline showViewAllLink={false} limit={50} />
            <VisitNotesView />
          </div>
        )}
      </div>
    </div>
  );
}
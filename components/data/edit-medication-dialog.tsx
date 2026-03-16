"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/components/AuthContext";

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

interface EditMedicationDialogProps {
  medication?: Medication;
  onSuccess: () => void;
  onClose: () => void;
}

export function EditMedicationDialog({ medication, onSuccess, onClose }: EditMedicationDialogProps) {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    name: medication?.name || "",
    generic_name: medication?.generic_name || "",
    dosage: medication?.dosage || "",
    frequency: medication?.frequency || "",
    route: medication?.route || "oral",
    status: medication?.status || "active",
    start_date: medication?.start_date || "",
    end_date: medication?.end_date || "",
    prescribing_doctor: medication?.prescribing_doctor || "",
    pharmacy: medication?.pharmacy || "",
    notes: medication?.notes || "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      // Clean up the data - remove empty strings
      const cleanData = {
        name: formData.name,
        generic_name: formData.generic_name || null,
        dosage: formData.dosage || null,
        frequency: formData.frequency || null,
        route: formData.route || null,
        status: formData.status || 'active',
        start_date: formData.start_date || null,
        end_date: formData.end_date || null,
        prescribing_doctor: formData.prescribing_doctor || null,
        pharmacy: formData.pharmacy || null,
        notes: formData.notes || null,
      };

      if (medication) {
        // Update existing
        const { error } = await supabase
          .from('medications')
          .update(cleanData)
          .eq('id', medication.id);
        if (error) {
          console.error('Supabase error:', error);
          throw error;
        }
      } else {
        // Insert new
        const { error } = await supabase
          .from('medications')
          .insert({ ...cleanData, user_id: user.id });
        if (error) {
          console.error('Supabase error:', error);
          throw error;
        }
      }
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error saving medication:', error);
      alert('Failed to save medication. Check console for details.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background border border-cyan-500/20 rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-semibold text-foreground mb-4">
          {medication ? "Edit Medication" : "Add Medication"}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Brand Name *</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full bg-background border border-cyan-500/20 rounded px-3 py-2 text-foreground"
                placeholder="e.g., Metformin"
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground block mb-1">Generic Name</label>
              <input
                type="text"
                value={formData.generic_name}
                onChange={(e) => setFormData({ ...formData, generic_name: e.target.value })}
                className="w-full bg-background border border-cyan-500/20 rounded px-3 py-2 text-foreground"
                placeholder="e.g., Metformin HCl"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Dosage</label>
              <input
                type="text"
                value={formData.dosage}
                onChange={(e) => setFormData({ ...formData, dosage: e.target.value })}
                className="w-full bg-background border border-cyan-500/20 rounded px-3 py-2 text-foreground"
                placeholder="e.g., 500mg"
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground block mb-1">Frequency</label>
              <input
                type="text"
                value={formData.frequency}
                onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
                className="w-full bg-background border border-cyan-500/20 rounded px-3 py-2 text-foreground"
                placeholder="e.g., 2x daily"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Route</label>
              <select
                value={formData.route}
                onChange={(e) => setFormData({ ...formData, route: e.target.value })}
                className="w-full bg-background border border-cyan-500/20 rounded px-3 py-2 text-foreground"
              >
                <option value="oral">Oral</option>
                <option value="topical">Topical</option>
                <option value="injection">Injection</option>
                <option value="inhalation">Inhalation</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-muted-foreground block mb-1">Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full bg-background border border-cyan-500/20 rounded px-3 py-2 text-foreground"
              >
                <option value="active">Active</option>
                <option value="discontinued">Discontinued</option>
                <option value="paused">Paused</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Start Date</label>
              <input
                type="date"
                value={formData.start_date}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                className="w-full bg-background border border-cyan-500/20 rounded px-3 py-2 text-foreground"
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground block mb-1">End Date</label>
              <input
                type="date"
                value={formData.end_date}
                onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                className="w-full bg-background border border-cyan-500/20 rounded px-3 py-2 text-foreground"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1">Prescribing Doctor</label>
            <input
              type="text"
              value={formData.prescribing_doctor}
              onChange={(e) => setFormData({ ...formData, prescribing_doctor: e.target.value })}
              className="w-full bg-background border border-cyan-500/20 rounded px-3 py-2 text-foreground"
              placeholder="e.g., Dr. Jane Smith"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1">Pharmacy</label>
            <input
              type="text"
              value={formData.pharmacy}
              onChange={(e) => setFormData({ ...formData, pharmacy: e.target.value })}
              className="w-full bg-background border border-cyan-500/20 rounded px-3 py-2 text-foreground"
              placeholder="e.g., CVS Pharmacy"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1">Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              className="w-full bg-background border border-cyan-500/20 rounded px-3 py-2 text-foreground"
              placeholder="Additional notes..."
            />
          </div>

          <div className="flex gap-2 pt-4">
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-cyan-500 text-white rounded hover:bg-cyan-600"
            >
              {medication ? "Update" : "Add"} Medication
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-secondary text-foreground rounded hover:bg-secondary/80"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/components/AuthContext";

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

interface EditConditionDialogProps {
  condition?: Condition;
  onSuccess: () => void;
  onClose: () => void;
}

export function EditConditionDialog({ condition, onSuccess, onClose }: EditConditionDialogProps) {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    name: condition?.name || "",
    icd_10_code: condition?.icd_10_code || "",
    status: condition?.status || "active",
    diagnosed_date: condition?.diagnosed_date || "",
    resolved_date: condition?.resolved_date || "",
    severity: condition?.severity || "",
    notes: condition?.notes || "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      // Clean up the data - remove empty strings
      const cleanData = {
        name: formData.name,
        icd_10_code: formData.icd_10_code || null,
        status: formData.status || 'active',
        diagnosed_date: formData.diagnosed_date || null,
        resolved_date: formData.resolved_date || null,
        severity: formData.severity || null,
        notes: formData.notes || null,
      };

      if (condition) {
        // Update existing
        const { error } = await supabase
          .from('conditions')
          .update(cleanData)
          .eq('id', condition.id);
        if (error) {
          console.error('Supabase error:', error);
          throw error;
        }
      } else {
        // Insert new
        const { error } = await supabase
          .from('conditions')
          .insert({ ...cleanData, user_id: user.id });
        if (error) {
          console.error('Supabase error:', error);
          throw error;
        }
      }
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error saving condition:', error);
      alert('Failed to save condition. Check console for details.');
    }
  };
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background border border-cyan-500/20 rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-semibold text-foreground mb-4">
          {condition ? "Edit Condition" : "Add Condition"}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Name *</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full bg-background border border-cyan-500/20 rounded px-3 py-2 text-foreground"
              placeholder="e.g., Type 2 Diabetes"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">ICD-10 Code</label>
              <input
                type="text"
                value={formData.icd_10_code}
                onChange={(e) => setFormData({ ...formData, icd_10_code: e.target.value })}
                className="w-full bg-background border border-cyan-500/20 rounded px-3 py-2 text-foreground"
                placeholder="e.g., E11.9"
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground block mb-1">Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full bg-background border border-cyan-500/20 rounded px-3 py-2 text-foreground"
              >
                <option value="active">Active</option>
                <option value="resolved">Resolved</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Diagnosed Date</label>
              <input
                type="date"
                value={formData.diagnosed_date}
                onChange={(e) => setFormData({ ...formData, diagnosed_date: e.target.value })}
                className="w-full bg-background border border-cyan-500/20 rounded px-3 py-2 text-foreground"
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground block mb-1">Resolved Date</label>
              <input
                type="date"
                value={formData.resolved_date}
                onChange={(e) => setFormData({ ...formData, resolved_date: e.target.value })}
                className="w-full bg-background border border-cyan-500/20 rounded px-3 py-2 text-foreground"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1">Severity</label>
            <select
              value={formData.severity}
              onChange={(e) => setFormData({ ...formData, severity: e.target.value })}
              className="w-full bg-background border border-cyan-500/20 rounded px-3 py-2 text-foreground"
            >
              <option value="">Select severity</option>
              <option value="mild">Mild</option>
              <option value="moderate">Moderate</option>
              <option value="severe">Severe</option>
            </select>
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
              {condition ? "Update" : "Add"} Condition
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
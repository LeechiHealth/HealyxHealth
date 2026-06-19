"use client"

import * as React from "react"
import { Trash2, Edit2, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { supabase } from "@/lib/supabase/client"
import { useAuth } from "@/components/AuthContext"

interface BiomarkerRecord {
  id: string
  name: string
  value: number
  unit: string
  test_date: string
}

interface BiomarkerDetailModalProps {
  biomarkerName: string
  open: boolean
  onClose: () => void
  onUpdate: () => void
}

export function BiomarkerDetailModal({ biomarkerName, open, onClose, onUpdate }: BiomarkerDetailModalProps) {
  const { user } = useAuth()
  const [records, setRecords] = React.useState<BiomarkerRecord[]>([])
  const [loading, setLoading] = React.useState(true)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [editForm, setEditForm] = React.useState({ value: "", unit: "", date: "" })
  const [addingNew, setAddingNew] = React.useState(false)
  const [newForm, setNewForm] = React.useState({ value: "", unit: "", date: new Date().toISOString().split('T')[0] })

  React.useEffect(() => {
    if (open && user) {
      fetchRecords()
    }
  }, [open, user, biomarkerName])

  async function fetchRecords() {
    try {
      const { data, error } = await supabase
        .from('biomarkers')
        .select('*')
        .eq('user_id', user!.id)
        .eq('name', biomarkerName)
        .order('test_date', { ascending: false })

      if (error) throw error
      setRecords(data || [])
    } catch (error) {
      console.error('Error fetching records:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this record?')) return

    try {
      const { error } = await supabase
        .from('biomarkers')
        .delete()
        .eq('id', id)

      if (error) throw error
      
      await fetchRecords()
      onUpdate()
    } catch (error) {
      console.error('Error deleting:', error)
      alert('Failed to delete')
    }
  }

  async function handleEdit(record: BiomarkerRecord) {
    setEditingId(record.id)
    setEditForm({
      value: record.value.toString(),
      unit: record.unit,
      date: record.test_date,
    })
  }

  async function saveEdit(id: string) {
    try {
      const { error } = await supabase
        .from('biomarkers')
        .update({
          value: parseFloat(editForm.value),
          unit: editForm.unit,
          test_date: editForm.date,
        })
        .eq('id', id)

      if (error) throw error

      setEditingId(null)
      await fetchRecords()
      onUpdate()
    } catch (error) {
      console.error('Error updating:', error)
      alert('Failed to update')
    }
  }

  async function handleAddNew() {
    try {
      const { error } = await supabase
        .from('biomarkers')
        .insert({
          user_id: user!.id,
          name: biomarkerName,
          value: parseFloat(newForm.value),
          unit: newForm.unit,
          test_date: newForm.date,
        })

      if (error) throw error

      setAddingNew(false)
      setNewForm({ value: "", unit: "", date: new Date().toISOString().split('T')[0] })
      await fetchRecords()
      onUpdate()
    } catch (error) {
      console.error('Error adding:', error)
      alert('Failed to add')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>{biomarkerName} History</span>
            <Button
              size="sm"
              onClick={() => setAddingNew(true)}
              className="bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/30"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Result
            </Button>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : (
          <div className="space-y-3">
            {/* Add New Form */}
            {addingNew && (
              <div className="glass rounded-lg p-4 border border-cyan-500/30">
                <h3 className="text-sm font-semibold mb-3">Add New Result</h3>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Value</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={newForm.value}
                      onChange={(e) => setNewForm({ ...newForm, value: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Unit</Label>
                    <Input
                      value={newForm.unit}
                      onChange={(e) => setNewForm({ ...newForm, unit: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Date</Label>
                    <Input
                      type="date"
                      value={newForm.date}
                      onChange={(e) => setNewForm({ ...newForm, date: e.target.value })}
                    />
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <Button size="sm" onClick={handleAddNew} className="bg-cyan-500 hover:bg-cyan-600">
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setAddingNew(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* Records List */}
            {records.map((record) => (
              <div key={record.id} className="glass rounded-lg p-4 border border-border">
                {editingId === record.id ? (
                  // Edit Mode
                  <div>
                    <div className="grid grid-cols-3 gap-3 mb-3">
                      <div>
                        <Label>Value</Label>
                        <Input
                          type="number"
                          step="0.1"
                          value={editForm.value}
                          onChange={(e) => setEditForm({ ...editForm, value: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Unit</Label>
                        <Input
                          value={editForm.unit}
                          onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Date</Label>
                        <Input
                          type="date"
                          value={editForm.date}
                          onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => saveEdit(record.id)} className="bg-cyan-500 hover:bg-cyan-600">
                        Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  // View Mode
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-lg font-semibold text-foreground">
                        {record.value} <span className="text-sm text-muted-foreground">{record.unit}</span>
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(record.test_date).toLocaleDateString('en-US', { 
                          year: 'numeric', 
                          month: 'long', 
                          day: 'numeric' 
                        })}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleEdit(record)}
                        className="text-cyan-400 hover:text-cyan-300"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(record.id)}
                        className="text-destructive hover:text-destructive/80"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {records.length === 0 && !addingNew && (
              <div className="text-center py-8 text-muted-foreground">
                No results yet for {biomarkerName}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
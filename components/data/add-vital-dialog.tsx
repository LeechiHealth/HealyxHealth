"use client"

import * as React from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { supabase } from "@/lib/supabase/client"
import { useAuth } from "@/components/AuthContext"

const VITAL_TYPES = [
  { name: "Blood Pressure", unit: "mmHg", hasTwoValues: true },
  { name: "Heart Rate", unit: "bpm", hasTwoValues: false },
  { name: "Weight", unit: "kg", hasTwoValues: false },
  { name: "Temperature", unit: "°F", hasTwoValues: false },
  { name: "Oxygen Saturation", unit: "%", hasTwoValues: false },
  { name: "Respiratory Rate", unit: "/min", hasTwoValues: false },
] as const

export function AddVitalDialog({ onSuccess }: { onSuccess?: () => void }) {
  const { user } = useAuth()
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [formData, setFormData] = React.useState({
    type: "",
    value: "",
    value2: "",
    date: new Date().toISOString().split('T')[0],
    time: new Date().toTimeString().slice(0, 5),
  })

  const selectedType = VITAL_TYPES.find(t => t.name === formData.type)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) {
      alert('You must be logged in')
      return
    }

    setLoading(true)
    try {
      const vital: any = {
        user_id: user.id,
        recorded_at: `${formData.date}T${formData.time}:00`,
      }

      // Map to actual column names
      if (formData.type === "Blood Pressure") {
        vital.systolic_bp = parseInt(formData.value)
        vital.diastolic_bp = parseInt(formData.value2)
      } else if (formData.type === "Heart Rate") {
        vital.heart_rate = parseInt(formData.value)
      } else if (formData.type === "Weight") {
        vital.weight_kg = parseFloat(formData.value)
      } else if (formData.type === "Temperature") {
        vital.temperature_celsius = parseFloat(formData.value)
      } else if (formData.type === "Oxygen Saturation") {
        vital.oxygen_saturation = parseInt(formData.value)
      }

      console.log('Attempting to insert vital:', vital)
      
      const { data, error } = await supabase
        .from('vitals')
        .insert(vital)
        .select()

      if (error) {
        console.error('Supabase error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        throw error
      }
      
      console.log('Success! Inserted:', data)

      setFormData({
        type: "",
        value: "",
        value2: "",
        date: new Date().toISOString().split('T')[0],
        time: new Date().toTimeString().slice(0, 5),
      })
      setOpen(false)
      onSuccess?.()
    } catch (error: any) {
      console.error('Error adding vital:', error)
      alert('Failed to add vital: ' + (error.message || JSON.stringify(error)))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/30">
          <Plus className="h-4 w-4 mr-2" />
          Add Vital
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record Vital Sign</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="type">Vital Type</Label>
            <Select
              value={formData.type}
              onValueChange={(value) => setFormData({ ...formData, type: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select vital type" />
              </SelectTrigger>
              <SelectContent>
                {VITAL_TYPES.map((type) => (
                  <SelectItem key={type.name} value={type.name}>
                    {type.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedType?.hasTwoValues ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="value">Systolic</Label>
                <Input
                  id="value"
                  type="number"
                  placeholder="120"
                  value={formData.value}
                  onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="value2">Diastolic</Label>
                <Input
                  id="value2"
                  type="number"
                  placeholder="80"
                  value={formData.value2}
                  onChange={(e) => setFormData({ ...formData, value2: e.target.value })}
                  required
                />
              </div>
            </div>
          ) : (
            <div>
              <Label htmlFor="value">Value {selectedType && `(${selectedType.unit})`}</Label>
              <Input
                id="value"
                type="number"
                step="0.1"
                value={formData.value}
                onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                required
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="time">Time</Label>
              <Input
                id="time"
                type="time"
                value={formData.time}
                onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-cyan-500 text-white hover:bg-cyan-600"
            >
              {loading ? "Adding..." : "Add Vital"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
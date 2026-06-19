"use client"

import { useState, useEffect, useRef } from "react"
import { Upload, FileText, Image, Trash2, Eye, Download, Loader2, FolderOpen } from "lucide-react"
import { supabase } from "@/lib/supabase/client"
import { useAuth } from "@/components/AuthContext"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface Document {
  id: string
  file_name: string
  file_type: string | null
  file_size_bytes: number | null
  storage_path: string
  category: string
  notes: string | null
  uploaded_at: string
}

const CATEGORIES = [
  { value: 'all', label: 'All Files' },
  { value: 'lab_result', label: 'Lab Results' },
  { value: 'imaging', label: 'Imaging' },
  { value: 'prescription', label: 'Prescriptions' },
  { value: 'visit_note', label: 'Visit Notes' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'other', label: 'Other' },
]

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function FileIcon({ mimeType }: { mimeType: string | null }) {
  if (mimeType?.startsWith('image/')) return <Image className="h-4 w-4 text-purple-400" />
  return <FileText className="h-4 w-4 text-cyan-400" />
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function DocumentsTab() {
  const { user } = useAuth()
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [uploadCategory, setUploadCategory] = useState("other")
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [viewingUrl, setViewingUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (user) fetchDocuments()
  }, [user])

  async function fetchDocuments() {
    if (!user) return
    setLoading(true)
    try {
      const { data, error: fetchError } = await supabase
        .from('documents')
        .select('*')
        .eq('user_id', user.id)
        .order('uploaded_at', { ascending: false })

      if (fetchError) throw fetchError
      setDocuments(data || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !user) return

    setUploading(true)
    setError("")

    try {
      // Upload directly via authenticated Supabase client — no server route needed
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const storagePath = `${user.id}/${Date.now()}-${safeName}`

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(storagePath, file, { contentType: file.type, upsert: false })

      if (uploadError) throw new Error(uploadError.message)

      const { error: dbError } = await supabase.from('documents').insert({
        user_id: user.id,
        file_name: file.name,
        file_type: file.type,
        file_size_bytes: file.size,
        storage_path: storagePath,
        category: uploadCategory,
      })

      if (dbError) {
        // Clean up storage if DB insert fails
        await supabase.storage.from('documents').remove([storagePath])
        throw new Error(dbError.message)
      }

      await fetchDocuments()
      toast.success(`"${file.name}" uploaded successfully`)
    } catch (err: any) {
      setError(err.message)
      toast.error(`Upload failed: ${err.message}`)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleDelete(doc: Document) {
    if (!user) return
    if (!confirm(`Delete "${doc.file_name}"? This cannot be undone.`)) return

    setDeletingId(doc.id)
    try {
      if (doc.storage_path) {
        await supabase.storage.from('documents').remove([doc.storage_path])
      }
      const { error } = await supabase.from('documents').delete().eq('id', doc.id)
      if (error) throw new Error(error.message)
      setDocuments(prev => prev.filter(d => d.id !== doc.id))
      toast.success(`"${doc.file_name}" deleted`)
    } catch (err: any) {
      setError(err.message)
      toast.error(`Delete failed: ${err.message}`)
    } finally {
      setDeletingId(null)
    }
  }

  async function handleView(doc: Document) {
    try {
      const { data } = await supabase.storage
        .from('documents')
        .createSignedUrl(doc.storage_path, 60)
      if (data?.signedUrl) window.open(data.signedUrl, '_blank')
      else toast.error('Could not open file.')
    } catch {
      toast.error('Could not open file. Try downloading instead.')
    }
  }

  async function handleDownload(doc: Document) {
    try {
      const { data } = await supabase.storage
        .from('documents')
        .createSignedUrl(doc.storage_path, 60)
      if (data?.signedUrl) {
        const a = document.createElement('a')
        a.href = data.signedUrl
        a.download = doc.file_name
        a.click()
      }
    } catch {
      toast.error('Download failed.')
    }
  }

  const filtered = categoryFilter === 'all'
    ? documents
    : documents.filter(d => d.category === categoryFilter)

  return (
    <div className="space-y-5">
      {/* Upload bar */}
      <div className="glass rounded-2xl p-5 border border-cyan-500/20">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-foreground mb-1">Upload a Document</h2>
            <p className="text-xs text-muted-foreground">Lab PDFs, imaging reports, prescriptions, insurance cards — up to 50 MB</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <select
              value={uploadCategory}
              onChange={(e) => setUploadCategory(e.target.value)}
              className="bg-secondary border border-border rounded px-2 py-1.5 text-sm text-foreground"
            >
              {CATEGORIES.filter(c => c.value !== 'all').map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 px-4 py-2 bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-xl hover:bg-cyan-500/30 transition-colors text-sm disabled:opacity-50"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading ? "Uploading…" : "Upload File"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.txt,.doc,.docx"
              className="hidden"
              onChange={handleFileUpload}
            />
          </div>
        </div>

        {error && (
          <div className="mt-3 bg-red-500/10 border border-red-500/30 rounded p-3 text-red-400 text-sm">
            {error}
          </div>
        )}
      </div>

      {/* Category filter */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {CATEGORIES.map(cat => (
          <button
            key={cat.value}
            onClick={() => setCategoryFilter(cat.value)}
            className={cn(
              "px-3 py-1.5 text-xs rounded-full border whitespace-nowrap transition-colors",
              categoryFilter === cat.value
                ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/40"
                : "bg-secondary text-muted-foreground border-border hover:text-foreground"
            )}
          >
            {cat.label}
            {cat.value !== 'all' && (
              <span className="ml-1 opacity-60">
                ({documents.filter(d => d.category === cat.value).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Documents table */}
      <div className="glass rounded-2xl border border-cyan-500/20 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading documents…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="h-12 w-12 rounded-full bg-cyan-500/10 flex items-center justify-center">
              <FolderOpen className="h-6 w-6 text-cyan-400" />
            </div>
            <p className="text-sm text-muted-foreground">No documents yet</p>
            <p className="text-xs text-muted-foreground">Upload lab reports, scans, or medical records above</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-wide text-muted-foreground font-medium">File</th>
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-wide text-muted-foreground font-medium">Category</th>
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-wide text-muted-foreground font-medium">Size</th>
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-wide text-muted-foreground font-medium">Uploaded</th>
                  <th className="text-right px-4 py-3 text-xs uppercase tracking-wide text-muted-foreground font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((doc) => (
                  <tr key={doc.id} className="border-b border-border/50 hover:bg-white/2 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <FileIcon mimeType={doc.file_type} />
                        <span className="text-foreground truncate max-w-[200px]" title={doc.file_name}>
                          {doc.file_name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 text-xs rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                        {CATEGORIES.find(c => c.value === doc.category)?.label || doc.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{formatBytes(doc.file_size_bytes)}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(doc.uploaded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleView(doc)}
                          className="p-1.5 rounded hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
                          title="View"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDownload(doc)}
                          className="p-1.5 rounded hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
                          title="Download"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(doc)}
                          disabled={deletingId === doc.id}
                          className="p-1.5 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors disabled:opacity-50"
                          title="Delete"
                        >
                          {deletingId === doc.id
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <Trash2 className="h-4 w-4" />
                          }
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

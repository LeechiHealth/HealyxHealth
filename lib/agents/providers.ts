// The national NPI registry (NPPES) from CMS: every US clinician and facility that
// bills insurance, with specialty, practice address and phone. Free, no key.
// It does not say who is in network or taking new patients; agents verify that separately.

export interface RegistryProvider {
  npi: string
  name: string
  kind: "individual" | "organization"
  credential?: string
  specialty?: string
  address?: string
  city?: string
  state?: string
  zip?: string
  phone?: string
}

export interface ProviderSearch {
  specialty?: string
  name?: string
  city?: string
  state?: string
  zip?: string
  organization?: boolean
  limit?: number
}

const REGISTRY = "https://npiregistry.cms.hhs.gov/api/"

const title = (value: unknown) => String(value ?? "").toLowerCase().replace(/\b\w/g, c => c.toUpperCase()).trim()
const phone = (value: unknown) => {
  const digits = String(value ?? "").replace(/\D/g, "")
  return digits.length === 10 ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` : undefined
}

export function registryUrl(search: ProviderSearch): string {
  const params = new URLSearchParams({ version: "2.1", limit: String(Math.min(Math.max(search.limit ?? 10, 1), 20)) })
  if (search.specialty) params.set("taxonomy_description", search.specialty.slice(0, 80))
  if (search.name) {
    const parts = search.name.trim().split(/\s+/)
    if (search.organization) params.set("organization_name", `${search.name.slice(0, 60)}*`)
    else if (parts.length > 1) { params.set("first_name", parts[0]); params.set("last_name", parts.slice(1).join(" ")) }
    else params.set("last_name", parts[0])
  }
  if (search.organization) params.set("enumeration_type", "NPI-2")
  else if (search.name) params.set("enumeration_type", "NPI-1")
  if (search.city) params.set("city", search.city.slice(0, 60))
  if (search.state) params.set("state", search.state.slice(0, 2).toUpperCase())
  // The registry takes a ZIP prefix with a wildcard, which widens a 5-digit ZIP to the nearby area.
  if (search.zip && /^\d{5}$/.test(search.zip)) params.set("postal_code", `${search.zip.slice(0, 3)}*`)
  return `${REGISTRY}?${params}`
}

export function parseRegistry(data: any): RegistryProvider[] {
  const results = Array.isArray(data?.results) ? data.results : []
  return results.map((r: any): RegistryProvider | null => {
    const basic = r?.basic || {}
    const isOrg = r?.enumeration_type === "NPI-2"
    const name = isOrg ? title(basic.organization_name) : [basic.first_name, basic.last_name].map(title).filter(Boolean).join(" ")
    if (!r?.number || !name) return null
    const location = (Array.isArray(r.addresses) ? r.addresses : []).find((a: any) => a?.address_purpose === "LOCATION") || r.addresses?.[0] || {}
    const taxonomy = (Array.isArray(r.taxonomies) ? r.taxonomies : []).find((t: any) => t?.primary) || r.taxonomies?.[0]
    return {
      npi: String(r.number), name, kind: isOrg ? "organization" : "individual",
      credential: basic.credential ? String(basic.credential).replace(/\./g, "") : undefined,
      specialty: taxonomy?.desc || undefined,
      address: [location.address_1, location.address_2].map(title).filter(Boolean).join(", ") || undefined,
      city: title(location.city) || undefined, state: location.state || undefined,
      zip: location.postal_code ? String(location.postal_code).slice(0, 5) : undefined,
      phone: phone(location.telephone_number),
    }
  }).filter((p: RegistryProvider | null): p is RegistryProvider => Boolean(p))
}

export async function searchProviders(search: ProviderSearch, fetcher: typeof fetch = fetch): Promise<RegistryProvider[]> {
  const response = await fetcher(registryUrl(search), { signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`NPI registry returned ${response.status}`)
  return parseRegistry(await response.json())
}

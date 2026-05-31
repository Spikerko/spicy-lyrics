export type ExpirationSettings = {
	Duration: number
	Unit: "Weeks" | "Months" | "Days" | "Hours" | "Minutes" | "Seconds"
}

export type ExpireStoreInterface<ItemType> = {
	GetItem: (itemName: string) => Promise<ItemType | undefined>
	SetItem: (itemName: string, content: ItemType) => Promise<ItemType>
	RemoveItem: (itemName: string) => Promise<void>
	Destroy: () => Promise<void>
}

type ExpireItem<C> = {
	ExpiresAt: number
	CacheVersion: number
	Content: C
}

type InstantEnvelope<T> = {
	Version: number
	Items: T
}

const instantStoreRegistry = new Set<string>()
const expireStoreRegistry = new Set<string>()

const deepClone = <V>(value: V): V => JSON.parse(JSON.stringify(value)) as V

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
	typeof v === "object" && v !== null && !Array.isArray(v)

const topUp = (
	target: Record<string, unknown>,
	template: Record<string, unknown>,
	path: string,
): void => {
	for (const key of Object.keys(template)) {
		const tplValue = template[key]
		const subPath = `${path}.${key}`

		if (!(key in target)) {
			target[key] = deepClone(tplValue)
			continue
		}

		const tgtValue = target[key]
		const tplIsObj = isPlainObject(tplValue)
		const tgtIsObj = isPlainObject(tgtValue)

		if (tplIsObj && tgtIsObj) {
			topUp(tgtValue, tplValue, subPath)
			continue
		}

		if (typeof tplValue !== typeof tgtValue) {
			throw new Error(`Template Type mismatch at ${subPath}`)
		}
	}
}

const computeExpiresAt = (settings: ExpirationSettings): number => {
	const date = new Date()
	const { Duration, Unit } = settings

	switch (Unit) {
		case "Seconds":
			return date.getTime() + Duration * 1_000
		case "Minutes":
			return date.getTime() + Duration * 60_000
		case "Hours":
			return date.getTime() + Duration * 3_600_000
		case "Days":
			return date.getTime() + Duration * 86_400_000
		case "Weeks":
			return date.getTime() + Duration * 7 * 86_400_000
		case "Months":
			date.setMonth(date.getMonth() + Duration)
			return date.getTime()
	}
}

export function GetInstantStore<T extends Record<string, unknown>>(
	storeName: string,
	version: number,
	template: T,
	forceNewData?: true,
): Readonly<{ Items: T; SaveChanges: () => void }> {
	if (instantStoreRegistry.has(storeName)) {
		throw new Error(`InstantStore "${storeName}" has already been retrieved`)
	}
	instantStoreRegistry.add(storeName)

	let items: T

	if (forceNewData) {
		items = deepClone(template)
	} else {
		const raw = localStorage.getItem(storeName)
		let parsed: InstantEnvelope<T> | null = null

		if (raw !== null) {
			try {
				parsed = JSON.parse(raw) as InstantEnvelope<T>
			} catch {
				parsed = null
			}
		}

		if (parsed !== null && parsed.Version === version) {
			items = parsed.Items
			topUp(
				items as Record<string, unknown>,
				template as Record<string, unknown>,
				`${storeName}.Items`,
			)
		} else {
			items = deepClone(template)
		}
	}

	const envelope: InstantEnvelope<T> = { Version: version, Items: items }

	const SaveChanges = (): void => {
		localStorage.setItem(storeName, JSON.stringify(envelope))
	}

	return Object.freeze({ Items: items, SaveChanges })
}

/**
 * Reads a Dynamic Store entry. The generic `I` is unchecked at runtime —
 * the value is always a raw string and is cast directly. Callers are
 * responsible for knowing the expected format.
 */
export function GetDynamicStoreItem<I>(
	storeName: string,
	itemName: string,
): I | undefined {
	const raw = localStorage.getItem(`${storeName}:${itemName}`)
	if (raw === null) return undefined
	return raw as unknown as I
}

export function SetDynamicStoreItem(
	storeName: string,
	itemName: string,
	content: string,
): void {
	localStorage.setItem(`${storeName}:${itemName}`, content)
}

export function GetExpireStore<ItemType>(
	storeName: string,
	version: number,
	itemExpirationSettings: ExpirationSettings,
	forceNewData?: true,
): Readonly<ExpireStoreInterface<ItemType>> {
	if (expireStoreRegistry.has(storeName)) {
		throw new Error(`ExpireStore "${storeName}" has already been retrieved`)
	}
	expireStoreRegistry.add(storeName)

	const requestUrl = (itemName: string): string => `/${itemName}`

	const GetItem = async (itemName: string): Promise<ItemType | undefined> => {
		if (forceNewData) return undefined

		const cache = await caches.open(storeName)
		const response = await cache.match(requestUrl(itemName))
		if (!response) return undefined

		const wrapped = (await response.json()) as ExpireItem<ItemType>
		if (wrapped.CacheVersion !== version) return undefined
		if (wrapped.ExpiresAt < Date.now()) return undefined

		return wrapped.Content
	}

	const SetItem = async (
		itemName: string,
		content: ItemType,
	): Promise<ItemType> => {
		const wrapped: ExpireItem<ItemType> = {
			ExpiresAt: computeExpiresAt(itemExpirationSettings),
			CacheVersion: version,
			Content: content,
		}

		try {
			const cache = await caches.open(storeName)
			await cache.put(
				requestUrl(itemName),
				new Response(JSON.stringify(wrapped), {
					headers: { "Content-Type": "application/json" },
				}),
			)
		} catch (err) {
			console.warn(
				`ExpireStore "${storeName}": failed to write item "${itemName}"`,
				err,
			)
		}

		return content
	}

	const RemoveItem = async (itemName: string): Promise<void> => {
		try {
			const cache = await caches.open(storeName)
			const ok = await cache.delete(requestUrl(itemName))
			if (!ok) {
				console.warn(
					`ExpireStore "${storeName}": item "${itemName}" not found on remove`,
				)
			}
		} catch (err) {
			console.warn(
				`ExpireStore "${storeName}": error removing item "${itemName}"`,
				err,
			)
			throw err
		}
	}

	const Destroy = async (): Promise<void> => {
		try {
			const ok = await caches.delete(storeName)
			if (!ok) {
				console.warn(
					`ExpireStore "${storeName}": cache not found on destroy`,
				)
			}
			expireStoreRegistry.delete(storeName)
		} catch (err) {
			console.warn(`ExpireStore "${storeName}": error destroying`, err)
			throw err
		}
	}

	return Object.freeze({ GetItem, SetItem, RemoveItem, Destroy })
}

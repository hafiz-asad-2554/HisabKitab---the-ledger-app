import { Contact, getPermissionsAsync, requestPermissionsAsync } from 'expo-contacts';

export type DeviceContact = { id: string; name: string; phone: string; avatarUri?: string };

async function mapContact(contact: Contact): Promise<DeviceContact | undefined> {
  const [name, phones, avatarUri] = await Promise.all([contact.getFullName(), contact.getPhones(), contact.getImage()]);
  const phone = phones[0]?.number;
  return phone ? { id: contact.id, name: name || phone, phone, avatarUri: avatarUri || undefined } : undefined;
}

/** Opens the platform's own contact-picker UI after requesting contacts permission. */
export async function pickDeviceContact(): Promise<DeviceContact | undefined> {
  const existing = await getPermissionsAsync();
  const permission = existing.granted ? existing : await requestPermissionsAsync();
  if (!permission.granted) throw new Error('Contacts permission was not granted.');
  const selected = await Contact.presentPicker();
  return selected ? mapContact(selected) : undefined;
}

/** Reads the latest values for an existing linked native contact. */
export async function getDeviceContact(id: string): Promise<DeviceContact | undefined> {
  return mapContact(new Contact(id));
}

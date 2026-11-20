import { expect, it } from 'vitest';
import { describeMatrixDb } from '../helpers/db-targets';
import { CustomerService } from '../../../src/main/services/customer-service';
import { createFilledDraft, createService, createTestDb } from '../../fixtures/db';
import { makeDraftInput } from '../../fixtures/invoice';

const customer = (name: string, city: string) => ({
  name,
  street: '',
  houseNo: '',
  zip: '8000',
  city,
  country: 'CH',
  notes: '',
});

describeMatrixDb('Suche ohne Beachtung der Gross-/Kleinschreibung, auch mit Umlauten', () => {
  it('Kunden werden nach Name und Ort gefunden; Sortierung nach kleingeschriebenem Namen, dann Id', async () => {
    const customers = new CustomerService(await createTestDb());
    await customers.save(customer('Müller AG', 'Zürich'));
    await customers.save(customer('meier & Söhne', 'Bern'));
    await customers.save(customer('Åse Berg', 'Genève'));
    await customers.save(customer('Aaron Test', 'Basel'));
    await customers.save(customer('MÜLLER Zwei', 'Chur'));

    const names = async (search?: string) => (await customers.list(search)).map((c) => c.name);
    expect(await names('müller')).toEqual(['Müller AG', 'MÜLLER Zwei']);
    expect(await names('ZÜRICH')).toEqual(['Müller AG']);
    expect(await names('åse')).toEqual(['Åse Berg']);
    expect(await names('genève')).toEqual(['Åse Berg']);
    expect(await names('  söhne ')).toEqual(['meier & Söhne']);
    expect(await names('gibtesnicht')).toEqual([]);
    expect(await names()).toEqual([
      'Aaron Test',
      'meier & Söhne',
      'Müller AG',
      'MÜLLER Zwei',
      'Åse Berg',
    ]);
  });

  it('Rechnungen werden nach Nummer und Empfängername gefunden; Entwürfe ohne Nummer stören nicht', async () => {
    const { service } = createService(await createTestDb());
    const debtor = (name: string) => ({ ...makeDraftInput().debtor, name });
    const a = await service.issue(
      (await createFilledDraft(service, { debtor: debtor('Müller AG') })).id,
    );
    await createFilledDraft(service, { debtor: debtor('Zürcher Treuhand') });

    const ids = async (search: string) => (await service.list({ search })).map((r) => r.id);
    expect(await ids('müller')).toEqual([a.id]);
    expect(await ids('MÜLLER')).toEqual([a.id]);
    expect(await ids('re-2026-0001')).toEqual([a.id]);
    expect((await ids('ZÜRCHER')).length).toBe(1);
    expect(await ids('treuhand')).toHaveLength(1);
  });
});

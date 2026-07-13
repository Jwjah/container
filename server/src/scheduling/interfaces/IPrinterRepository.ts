import { Printer } from '../domain/entities/Printer';

export interface IPrinterRepository {
  findById(id: number, connection?: any): Promise<Printer | null>;
  findByShopId(shopId: number, connection?: any): Promise<Printer[]>;
  create(printer: Printer, connection?: any): Promise<number>;
  update(printer: Printer, connection?: any): Promise<void>;
  deleteAll(connection?: any): Promise<void>;
}

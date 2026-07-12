export interface IPrintJobAuthorizationService {
  /**
   * Asserts the user is the owner of the shop managing the print job.
   */
  assertShopAccess(printJobId: number, userId: number, connection?: any): Promise<void>;

  /**
   * Asserts the user is either the managing shop owner or the student who placed the order.
   */
  assertUserAccess(printJobId: number, userId: number, connection?: any): Promise<'student' | 'shop'>;
}

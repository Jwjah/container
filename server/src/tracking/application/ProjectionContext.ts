import { ProjectionUpdateService } from './ProjectionUpdateService';

/**
 * ProjectionContext — context object passed to event handlers.
 *
 * RFC-007 §39
 */
export interface ProjectionContext {
  projectionUpdateService: ProjectionUpdateService;
  connection?: any;
}

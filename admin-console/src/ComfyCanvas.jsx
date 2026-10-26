// Compatibility entry point; all graph editing uses the same canvas.
import { WorkflowCanvas } from './WorkflowAdmin.jsx';
export function ComfyCanvas(props) { return <WorkflowCanvas {...props} dirty={false} />; }

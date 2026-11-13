import '../css/style.css';
import { bootstrapDolomite } from './export';

const dolomiteApp = bootstrapDolomite();

export const router = dolomiteApp.router;
export default dolomiteApp;
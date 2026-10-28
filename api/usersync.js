import {createUserSyncHandler,kvTransport} from '../server/usersync/session.mjs';
const transport=kvTransport();
export default createUserSyncHandler({origin:'https://research.bittrees.org',prefix:'bittrees:research:usersync:',fallbackPrefix:'bittrees:usersync:',...transport});

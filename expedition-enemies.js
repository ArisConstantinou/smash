export const RARE_WEAPONS=Object.freeze(['w04','w07','w10']);
export const CAMP_RARE_CHANCE=.28;
export const WAVE_RARE_CHANCE=.025;

export function nextRareWeapon(tier,discoveries){
  return RARE_WEAPONS[tier]&&!discoveries?.[RARE_WEAPONS[tier]]?RARE_WEAPONS[tier]:null;
}

export function patrolIntent(patrol,enemy,player,seesPlayer){
  const distance=Math.hypot(player.x-enemy.x,player.z-enemy.z);
  const fromPost=Math.hypot(enemy.x-patrol.x,enemy.z-patrol.z);
  const playerFromPost=Math.hypot(player.x-patrol.x,player.z-patrol.z);
  if(fromPost>19||playerFromPost>24)patrol.alert=false;
  else if(distance<=3.5||seesPlayer&&distance<=12||enemy.hurtTimer>0)patrol.alert=true;
  if(patrol.alert)return player;
  if(Math.hypot(enemy.x-patrol.targetX,enemy.z-patrol.targetZ)<1.1){
    patrol.side*=-1;
    patrol.targetX=patrol.x+patrol.dx*patrol.side;
    patrol.targetZ=patrol.z+patrol.dz*patrol.side;
  }
  return {x:patrol.targetX,z:patrol.targetZ};
}

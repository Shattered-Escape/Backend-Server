'use strict';
function sortOffersByID (a, b) {
  return a.intId - b.intId;
}
function sortOffersByRating (a, b) {
  return a.user.rating - b.user.rating;
}
function sortOffersByName (a, b) {
  // @TODO: Get localized item names
  try {
    let aa = helper_f.getItem(a._id)[1]._name;
    let bb = helper_f.getItem(b._id)[1]._name;
    aa = aa.substring(aa.indexOf('_') + 1);
    bb = bb.substring(bb.indexOf('_') + 1);
    return aa.localeCompare(bb);
  } catch (e) {
    return 0;
  }
}
function sortOffersByPrice (a, b) {
  return a.requirements[0].count - b.requirements[0].count;
}
function sortOffersByPriceSummaryCost (a, b) {
  return a.summaryCost - b.summaryCost;
}
function sortOffersByExpiry (a, b) {
  return a.endTime - b.endTime;
}
function sortOffers (request, offers) {
  // Sort results
  switch (request.sortType) {
  case 0: // ID
    offers.sort(sortOffersByID);
    break;
  case 3: // Merchant (rating)
    offers.sort(sortOffersByRating);
    break;
  case 4: // Offer (title)
    offers.sort(sortOffersByName);
    break;
  case 5: // Price
    if (request.removeBartering == true) {
      offers.sort(sortOffersByPriceSummaryCost);
    } else {
      offers.sort(sortOffersByPrice);
    }
    break;
  case 6: // Expires in
    offers.sort(sortOffersByExpiry);
    break;
  }
  // 0=ASC 1=DESC
  if (request.sortDirection == 1) {
    offers.reverse();
  }
  return offers;
}
/* Scans a given slot type for filters and returns them as a Set */
function getFilters (item, slot) {
  let result = new Set();
  if (slot in item._props && item._props[slot].length) {
    for (let sub of item._props[slot]) {
      if ('_props' in sub && 'filters' in sub._props) {
        for (let filter of sub._props.filters) {
          for (let f of filter.Filter) {
            result.add(f);
          }
        }
      }
    }
  }
  return result;
}
/* Like getFilters but breaks early and return true if id is found in filters */
function isInFilter (id, item, slot) {
  if (slot in item._props && item._props[slot].length) {
    for (let sub of item._props[slot]) {
      if ('_props' in sub && 'filters' in sub._props) {
        for (let filter of sub._props.filters) {
          if (filter.Filter.includes(id)) {
            return true;
          }
        }
      }
    }
  }
  return false;
}
/* Because of presets, categories are not always 1 */
function countCategories (response) {
  let categ = {};
  for (const thisOffer of response.offers) {
    const thisItem = thisOffer.items[0]; // only the first item can have presets
    categ[thisItem._tpl] = categ[thisItem._tpl] || 0;
    categ[thisItem._tpl]++;
  }
  // not in search mode, add back non-weapon items
  for (const thisCategory in response.categories) {
    if (!categ[thisCategory]) {
      categ[thisCategory] = 1;
    }
  }
  response.categories = categ;
}
function getOffers (sessionID, request) {
  console.info(request);
  let response = { categories: {}, offers: [], offersCount: 10, selectedCategory: '5b5f78dc86f77409407a7f8e' };
  let traderOffers = [];
  let playerOffers = [];
  let offers = [];
  if (!request.linkedSearchId && !request.neededSearchId) {
    response.categories = (trader_f.handler.getAssort(sessionID, 'ragfair')).loyal_level_items;
  }
  // Add Trader items if trader or all filter selected
  if (request.offerOwnerType === 1 || request.offerOwnerType === 0) {
    traderOffers = getOffersFromTraders(sessionID, request);
  }
  // Add Player items if player or all filter selected
  if (request.offerOwnerType === 2 || request.offerOwnerType === 0) {
    playerOffers = getOffersFromPlayers(sessionID, request);
  }
  // Remove barter offers, trader already done in getOffersFromTraders
  if (request.removeBartering == true) {
    playerOffers = removeBarterOffers(playerOffers);
  }
  // Merge offers - don't remove duplicates, we like having multiple offers per item unless....
  offers = offers.concat(traderOffers, playerOffers);
  // Weapons presets - we don't like duplicates now
  if (request.buildCount) {
    let offersSeen = [];
    let finalOffers = [];
    offers = sortOffers(request, offers);
    for (let offer of offers) {
      let id = offer.items[0]._tpl;
      if (id in offersSeen)
        continue;
      else {
        offersSeen[id] = true;
        if (id in request.buildItems) {
          // We do like duplicates again if this build requires multiples of the same parts :P
          for (let partCount = 0; partCount < request.buildItems[id]; partCount++) {
            finalOffers = finalOffers.concat(offer);
          }
        } else {
          finalOffers = finalOffers.concat(offer);
        }
      }
    }
    offers = finalOffers;
  }
  response.offers = sortOffers(request, offers);
  countCategories(response);
  return response;
}
function getOffersFromTraders (sessionID, request) {
  let traderOffers = utility.wipeDepend(global._database.fleaMarket.traderOffers);
  let itemsToAdd = [];
  let offers = [];
  traderOffers.categories = {};
  for (const thisCategory of traderOffers.offers) {
    traderOffers.categories[thisCategory.items[0]._tpl] = 1;
  }
  if (request.buildCount) {
    // Case: weapon builds
    itemsToAdd = itemsToAdd.concat(Object.keys(request.buildItems));
    traderOffers = fillCategories(traderOffers, itemsToAdd);
  } else {
    // Case: search
    if (request.linkedSearchId) {
      itemsToAdd = itemsToAdd.concat(getLinkedSearchList(request.linkedSearchId));
      traderOffers = fillCategories(traderOffers, itemsToAdd);
    } else if (request.neededSearchId) {
      itemsToAdd = itemsToAdd.concat(getNeededSearchList(request.neededSearchId));
      traderOffers = fillCategories(traderOffers, itemsToAdd);
    }
    // Case: category
    if (request.handbookId) {
      let handbookList = getCategoryList(request.handbookId);
      if (itemsToAdd.length) {
        itemsToAdd = helper_f.arrayIntersect(itemsToAdd, handbookList);
      } else {
        itemsToAdd = handbookList;
      }
    }
  }
  for (const thisOffer in traderOffers.offers) {
    for (const tplTokeep of itemsToAdd) {
      if (traderOffers.offers[thisOffer].items[0]._tpl == tplTokeep) {
        if (request.onlyFunctional) { // Remove non-functional items such as lowers from traderOffers
          if (traderOffers.offers[thisOffer].items.length == 1 && preset_f.handler.hasPreset(traderOffers.offers[thisOffer].items[0]._tpl)) { // If this offer contains an item that has a preset (like a lower) but is only a single item
            continue; // Skip this item
          }
        }
        traderOffers.offers[thisOffer].summaryCost = calculateCost(traderOffers.offers[thisOffer].requirements);
        // check if offer is really available, removes any quest locked items not in current assort of a trader
        const tmpOffer = traderOffers.offers[thisOffer];
        const traderId = tmpOffer.user.id;
        const traderAssort = trader_f.handler.getAssort(sessionID, traderId).items;
        let keepItem = false; // for testing
        for (const thisItem of traderAssort) {
          if (thisItem._id == tmpOffer.root) {
            offers.push(traderOffers.offers[thisOffer]);
            keepItem = true;
            break;
          }
        }
      }
    }
  }
  if (request.removeBartering == true) {
    offers = removeBarterOffers(offers);
  }
  traderOffers.offers = offers;
  traderOffers.offers = sortOffers(request, traderOffers.offers);
  return traderOffers.offers;
}
function getOffersFromPlayers (sessionID, request) {
  let itemsToAdd = [];
  let offers = [];
  if (request.buildCount) {
    // Case: weapon builds
    itemsToAdd = itemsToAdd.concat(Object.keys(request.buildItems));
  } else {
    // Case: search
    if (request.linkedSearchId) {
      itemsToAdd = getLinkedSearchList(request.linkedSearchId);
    } else if (request.neededSearchId) {
      itemsToAdd = getNeededSearchList(request.neededSearchId);
    }
    // Case: category
    if (request.handbookId) {
      const handbook = getCategoryList(request.handbookId);
      if (itemsToAdd.length) {
        itemsToAdd = helper_f.arrayIntersect(itemsToAdd, handbook);
      } else {
        itemsToAdd = handbook;
      }
    }
  }
  for (const thisItem of itemsToAdd) {
    if (!global._database.fleaMarket.blacklist.includes(thisItem)) { // If item isn't blacklisted
      offers = offers.concat(ragfair_f.createOffer(thisItem, request.onlyFunctional, request.buildCount == 0));
    }
  }
  return offers;
}
function fillCategories (response, filters) {
  response.categories = {};
  for (const thisFilter of filters) {
    response.categories[thisFilter] = 1;
  }
  return response;
}
function removeBarterOffers (offers) {
  let override = [];
  for (const thisOffer of offers) {
    if (helper_f.isMoneyTpl(thisOffer.requirements[0]._tpl) == true) {
      override.push(thisOffer);
    }
  }
  offers = override;
  return offers;
}
function calculateCost (barter_scheme)//theorical , not tested not implemented
{
  let summaryCost = 0;
  for (const thisBarter of barter_scheme) {
    summaryCost += helper_f.getTemplatePrice(thisBarter._tpl) * thisBarter.count;
  }
  return Math.round(summaryCost);
}
function getLinkedSearchList (linkedSearchId) {
  const thisItem = global._database.items[linkedSearchId];
  // merging all possible filters without duplicates
  let result = new Set([
    ...getFilters(thisItem, 'Slots'),
    ...getFilters(thisItem, 'Chambers'),
    ...getFilters(thisItem, 'Cartridges')
  ]);
  return Array.from(result);
}
function getNeededSearchList (neededSearchId) {
  let result = [];
  for (const thisItem of Object.values(global._database.items)) {
    if (isInFilter(neededSearchId, thisItem, 'Slots')
            || isInFilter(neededSearchId, thisItem, 'Chambers')
            || isInFilter(neededSearchId, thisItem, 'Cartridges')) {
      result.push(thisItem._id);
    }
  }
  return result;
}
function getCategoryList (handbookId) {
  let result = [];
  // if its 'mods' great-parent category, do double recursive loop
  if (handbookId == '5b5f71a686f77447ed5636ab') {
    for (const thisCategory of helper_f.childrenCategories(handbookId)) {
      for (const thisChildCategory of helper_f.childrenCategories(thisCategory)) {
        result = result.concat(helper_f.templatesWithParent(thisChildCategory));
      }
    }
  } else {
    if (helper_f.isCategory(handbookId)) {
      // list all item of the category
      result = result.concat(helper_f.templatesWithParent(handbookId));
      for (const thisCategory of helper_f.childrenCategories(handbookId)) {
        result = result.concat(helper_f.templatesWithParent(thisCategory));
      }
    } else {
      // its a specific item searched then
      result.push(handbookId);
    }
  }
  return result;
}
const offerBase = {
  _id: '42',
  intId: '123',
  user: {
    id: '99',
    memberType: 0,
    nickname: 'Unknown',
    rating: 100.0,
    isRatingGrowing: true,
    avatar: '/files/trader/avatar/unknown.jpg'
  },
  root: '5cf5e9f402153a196f20e270',
  items: [
    {
      _id: '5cf5e9f402153a196f20e270',
      _tpl: '54009119af1c881c07000029',
      upd: {
        UnlimitedCount: true,
        StackObjectsCount: 999999
      }
    }
  ],
  itemsCost: 1337,
  requirements: [
    {
      count: 1,
      _tpl: '5449016a4bdc2d6f028b456f'
    }
  ],
  requirementsCost: 1337,
  summaryCost: 1337,
  sellInOnePiece: false,
  startTime: 1577840400,
  endTime: 1735693200,
  priority: false,
  loyaltyLevel: 1
};
function createOffer (template, onlyFunc, usePresets = true) {
  // Some slot filters reference bad items
  if (!(template in global._database.items)) {
    logger.logWarning(`Item ${template} does not exist`);
    return [];
  }
  let offerArray = [];
  // Preset
  if (usePresets && preset_f.handler.hasPreset(template)) {
    const presets = utility.wipeDepend(preset_f.handler.getPresets(template));
    for (const thisPreset of presets) {
      let thisOffer = utility.wipeDepend(offerBase);
      let mods = thisPreset._items;
      let rub = 0;
      for (const thisMod of mods) {
        rub += helper_f.getTemplatePrice(thisMod._tpl);
      }
      mods[0].upd = mods[0].upd || {};    // append the stack count
      mods[0].upd.StackObjectsCount = offerBase.items[0].upd.StackObjectsCount;
      thisOffer._id = thisPreset._id;     // The offer's id is now the preset's id
      thisOffer.root = mods[0]._id;       // Sets the main part of the weapon
      thisOffer.items = mods;
      thisOffer.requirements[0].count = Math.round(rub * global._database.gameplayConfig.trading.ragfairMultiplier);
      offerArray.push(thisOffer);
    }
  }
  // Single item
  if (!preset_f.handler.hasPreset(template) || !onlyFunc) {
    const rubPrice = Math.round(helper_f.getTemplatePrice(template) * global._database.gameplayConfig.trading.ragfairMultiplier);
    let thisOffer = utility.wipeDepend(offerBase);
    thisOffer._id = template;
    thisOffer.items[0]._tpl = template;
    thisOffer.requirements[0].count = rubPrice;
    thisOffer.itemsCost = rubPrice;
    thisOffer.requirementsCost = rubPrice;
    thisOffer.summaryCost = rubPrice;
    offerArray.push(thisOffer);
  }
  return offerArray;
}
function itemMarKetPrice (request) {
  return null;
}
function ragFairAddOffer (request) {
  return null;
}
module.exports.createOffer = createOffer;
module.exports.ragFairAddOffer = ragFairAddOffer;
module.exports.itemMarKetPrice = itemMarKetPrice;
module.exports.getOffers = getOffers;

'use strict';
class DialogueServer {
  constructor () {
    this.dialogues = {};
  }
  initializeDialogue (sessionID) {
    this.dialogues[sessionID] = fileIO.readParsed(getPath(sessionID));
  }
  saveToDisk (sessionID) {
    if (sessionID in this.dialogues) {
      fileIO.write(getPath(sessionID), this.dialogues[sessionID]);
    }
  }
  /* Set the content of the dialogue on the list tab. */
  generateDialogueList (sessionID) {
    let data = [];
    for (let dialogueId in this.dialogues[sessionID]) {
      data.push(this.getDialogueInfo(dialogueId, sessionID));
    }
    return `{"err":0,"errmsg":null,"data": ${fileIO.stringify(data)}}`;
  }
  /* Get the content of a dialogue. */
  getDialogueInfo (dialogueId, sessionID) {
    let dialogue = this.dialogues[sessionID][dialogueId];
    return {
      '_id': dialogueId,
      'type': 2, // Type npcTrader.
      'message': this.getMessagePreview(dialogue),
      'new': dialogue.new,
      'attachmentsNew': dialogue.attachmentsNew,
      'pinned': dialogue.pinned
    };
  }
  /*
	* Set the content of the dialogue on the details panel, showing all the messages
	* for the specified dialogue.
	*/
  generateDialogueView (dialogueId, sessionID) {
    let dialogue = this.dialogues[sessionID][dialogueId];
    dialogue.new = 0;
    // Set number of new attachments, but ignore those that have expired.
    let attachmentsNew = 0;
    let currDt = Date.now() / 1000;
    for (let message of dialogue.messages) {
      if (message.hasRewards && !message.rewardCollected && currDt < (message.dt + message.maxStorageTime)) {
        attachmentsNew++;
      }
    }
    dialogue.attachmentsNew = attachmentsNew;
    return fileIO.stringify({'err':0,'errmsg':null, 'data': {'messages': this.dialogues[sessionID][dialogueId].messages}});
  }
  /*
	* Add a templated message to the dialogue.
	*/
  addDialogueMessage (dialogueID, messageContent, sessionID, rewards = []) {
    if(this.dialogues[sessionID] === undefined) {
      this.initializeDialogue(sessionID);
    }
    let dialogueData = this.dialogues[sessionID];
    let isNewDialogue = !(dialogueID in dialogueData);
    let dialogue = dialogueData[dialogueID];
    if (isNewDialogue) {
      dialogue = {
        '_id': dialogueID,
        'messages': [],
        'pinned': false,
        'new': 0,
        'attachmentsNew': 0
      };
      dialogueData[dialogueID] = dialogue;
    }
    dialogue.new += 1;
    // Generate item stash if we have rewards.
    let stashItems = {};
    if (rewards.length > 0) {
      const stashId = utility.generateNewItemId();
      stashItems.stash = stashId;
      stashItems.data = [];
      rewards = helper_f.replaceIDs(null, rewards);
      for (let reward of rewards) {
        if (!reward.hasOwnProperty('slotId') || reward.slotId === 'hideout') {
          reward.parentId = stashId;
          reward.slotId = 'main';
        }
        stashItems.data.push(reward);
      }
      dialogue.attachmentsNew += 1;
    }
    let message = {
      '_id': utility.generateNewDialogueId(),
      'uid': dialogueID,
      'type': messageContent.type,
      'dt': Date.now() / 1000,
      'templateId': messageContent.templateId,
      'text': messageContent.text,
      'hasRewards': rewards.length > 0,
      'rewardCollected': false,
      'items': stashItems,
      'maxStorageTime': messageContent.maxStorageTime,
      'systemData': messageContent.systemData
    };
    dialogue.messages.push(message);
    let notificationMessage = notifier_f.createNewMessageNotification(message);
    notifier_f.handler.addToMessageQueue(notificationMessage, sessionID);
  }
  /*
	* Get the preview contents of the last message in a dialogue.
	*/
  getMessagePreview (dialogue) {
    // The last message of the dialogue should be shown on the preview.
    let message = dialogue.messages[dialogue.messages.length - 1];
    return {
      'dt': message.dt,
      'type': message.type,
      'templateId': message.templateId,
      'uid': dialogue._id
    };
  }
  /*
	* Get the item contents for a particular message.
	*/
  getMessageItemContents (messageId, sessionID) {
    let dialogueData = this.dialogues[sessionID];
    for (let dialogueId in dialogueData) {
      let messages = dialogueData[dialogueId].messages;
      for (let message of messages) {
        if (message._id === messageId) {
          let attachmentsNew = this.dialogues[sessionID][dialogueId].attachmentsNew;
          if(attachmentsNew > 0) {
            this.dialogues[sessionID][dialogueId].attachmentsNew = attachmentsNew-1;
          }
          message.rewardCollected = true;
          return message.items.data;
        }
      }
    }
    return [];
  }
  removeDialogue (dialogueId, sessionID) {
    delete this.dialogues[sessionID][dialogueId];
  }
  setDialoguePin (dialogueId, shouldPin, sessionID) {
    this.dialogues[sessionID][dialogueId].pinned = shouldPin;
  }
  setRead (dialogueIds, sessionID) {
    let dialogueData = this.dialogues[sessionID];
    for (let dialogId of dialogueIds) {
      dialogueData[dialogId].new = 0;
      dialogueData[dialogId].attachmentsNew = 0;
    }
  }
  getAllAttachments (dialogueId, sessionID) {
    let output = [];
    let timeNow = Date.now() / 1000;
    for (let message of this.dialogues[sessionID][dialogueId].messages) {
      if (timeNow < (message.dt+message.maxStorageTime)) {
        output.push(message);
      }
    }
    this.dialogues[sessionID][dialogueId].attachmentsNew = 0;
    return {'messages': output};
  }
  // deletion of items that has been expired. triggers when updating traders.
  removeExpiredItems (sessionID) {
    for (let dialogueId in this.dialogues[sessionID]) {
      for (let message of this.dialogues[sessionID][dialogueId].messages) {
        if ((Date.now() / 1000) > (message.dt+message.maxStorageTime)) {
          message.items = {};
        }
      }
    }
  }
}
function getPath (sessionID) {
  let path = db.user.profiles.dialogue;
  return path.replace('__REPLACEME__', sessionID);
}
let messageTypes = {
  'npcTrader': 2,
  'insuranceReturn': 8,
  'questStart': 10,
  'questFail': 11,
  'questSuccess': 12
};
/*
* Return the int value associated with the messageType, for readability.
*/
function getMessageTypeValue (messageType) {
  return messageTypes[messageType];
}
// TODO(camo1018): Coalesce all findAndReturnChildren functions.
/* Find And Return Children (TRegular)
* input: MessageItems, InitialItem._id
* output: list of item._id
* List is backward first item is the furthest child and last item is main item
* returns all child items ids in array, includes itself and children
* Same as the function in helpFunctions, just adapted for message items.
* */
function findAndReturnChildren (messageItems, itemid) {
  let list = [];
  for (let childitem of messageItems) {
    if (childitem.parentId === itemid) {
      list.push.apply(list, findAndReturnChildren(messageItems, childitem._id));
    }
  }
  list.push(itemid);// it's required
  return list;
}
module.exports.handler = new DialogueServer();
module.exports.getMessageTypeValue = getMessageTypeValue;
module.exports.findAndReturnChildren = findAndReturnChildren;
